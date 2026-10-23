import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./db";
import {
  loadLocalPapers,
  summarizeAuthors,
  type DiscussionCommentInput,
  type PaperRecord,
} from "./content";
import { PAPER_STATUS, type PaperStatus } from "./constants";
import { authorLogins, parseAuthors, type PaperAuthor } from "./serialize";

export type IngestResult = "created" | "updated" | "unchanged";

function payloadHash(record: PaperRecord): string {
  return createHash("sha256")
    .update(`${record.paperId}:${record.contentSha256}`)
    .digest("hex");
}

function statusForUpdate(record: PaperRecord, existing?: string | null): PaperStatus {
  // Moderation decisions are website-owned: a re-sync must not silently
  // republish a paper that a moderator hid or rejected.
  if (existing === PAPER_STATUS.HIDDEN || existing === PAPER_STATUS.REJECTED) {
    return existing;
  }
  if (existing === PAPER_STATUS.PENDING_REVIEW && record.status === PAPER_STATUS.PUBLISHED) {
    // Content merged into the repo while the local review is still open:
    // keep it pending until an admin approves it in the site.
    return PAPER_STATUS.PENDING_REVIEW;
  }
  return record.status;
}

async function resolveUsers(logins: string[]) {
  const unique = Array.from(new Set(logins.filter(Boolean)));
  if (unique.length === 0) return new Map<string, { login: string; avatarUrl: string | null; name: string | null }>();
  const users = await prisma.user.findMany({
    where: { login: { in: unique } },
    select: { login: true, avatarUrl: true, name: true },
  });
  return new Map(users.map((u) => [u.login.toLowerCase(), u]));
}

function walkDiscussion(
  comments: DiscussionCommentInput[],
  ctx: {
    paperId: string;
    paperAuthorLogins: Set<string>;
    users: Map<string, { avatarUrl: string | null; name: string | null }>;
    parentId?: string;
  },
): Array<{
  id: string;
  paperId: string;
  githubCommentId: string | null;
  parentId: string | null;
  authorGithubId: string | null;
  authorLogin: string;
  authorAvatarUrl: string | null;
  authorName: string | null;
  bodySnapshot: string;
  reactionsJson: string;
  isAuthor: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date;
}> {
  const rows: ReturnType<typeof walkDiscussion> = [];
  for (const comment of comments) {
    const login = comment.author.toLowerCase();
    const profile = ctx.users.get(login);
    const createdAt = comment.createdAt ? new Date(comment.createdAt) : new Date();
    const id = comment.id ? `gh-${comment.id}` : `local-${randomUUID()}`;
    rows.push({
      id,
      paperId: ctx.paperId,
      githubCommentId: comment.id ?? null,
      parentId: ctx.parentId ?? null,
      authorGithubId: null,
      authorLogin: comment.author,
      authorAvatarUrl: profile?.avatarUrl ?? null,
      authorName: profile?.name ?? null,
      bodySnapshot: comment.body,
      reactionsJson: JSON.stringify(comment.reactions ?? {}),
      isAuthor: ctx.paperAuthorLogins.has(login),
      status: "VISIBLE",
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      updatedAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      syncedAt: new Date(),
    });
    if (comment.replies?.length) {
      rows.push(
        ...walkDiscussion(comment.replies, { ...ctx, parentId: id }),
      );
    }
  }
  return rows;
}

export async function ingestDiscussion(
  paperId: string,
  discussion: PaperRecord["discussion"],
  options: { authorLogins?: string[] } = {},
): Promise<{ commentCount: number; lastActivity: Date | null }> {
  if (!discussion?.comments?.length) {
    return { commentCount: 0, lastActivity: null };
  }
  const authorSet = new Set((options.authorLogins ?? []).map((login) => login.toLowerCase()));
  const allLogins = new Set<string>();
  const collect = (comments: DiscussionCommentInput[]) => {
    for (const comment of comments) {
      allLogins.add(comment.author);
      if (comment.replies) collect(comment.replies);
    }
  };
  collect(discussion.comments);
  const users = await resolveUsers(Array.from(allLogins));

  const rows = walkDiscussion(discussion.comments, {
    paperId,
    paperAuthorLogins: authorSet,
    users,
  });
  let newest: Date | null = null;
  for (const row of rows) {
    const existingComment = await prisma.comment.findUnique({ where: { id: row.id } });
    if (existingComment) {
      await prisma.comment.update({
        where: { id: row.id },
        data: { ...row, status: existingComment.status },
      });
    } else {
      await prisma.comment.create({ data: row });
    }
    if (!newest || row.createdAt > newest) newest = row.createdAt;
  }
  const visible = await prisma.comment.count({ where: { paperId, status: "VISIBLE" } });
  return { commentCount: visible, lastActivity: newest };
}

export async function ingestPaper(
  record: PaperRecord,
  options: { source?: "local" | "github"; actorLogin?: string } = {},
): Promise<IngestResult> {
  const source = options.source ?? "local";
  const authors: PaperAuthor[] = record.metadata.authors;
  const authorSet = new Set(authors.map((a) => a.login?.toLowerCase()).filter(Boolean));
  const existing = await prisma.paper.findUnique({ where: { id: record.paperId } });

  const data = {
    slug: record.slug,
    repoId: record.repoId,
    path: record.path,
    title: record.metadata.title,
    abstract: record.abstract,
    authorsJson: JSON.stringify(authors),
    authorLogins: authorLogins(authors),
    categoriesJson: JSON.stringify(record.metadata.categories),
    keywordsJson: JSON.stringify(record.metadata.keywords),
    license: record.metadata.license,
    language: record.metadata.language,
    sourceUrl: record.metadata.source_url ?? null,
    pdfUrl: record.metadata.pdf_url ?? null,
    status: statusForUpdate(record, existing?.status),
    currentCommitSha: record.sha,
    githubIssueNumber: record.discussion?.issueNumber ?? existing?.githubIssueNumber ?? null,
    discussionUrl: record.discussion?.issueUrl ?? existing?.discussionUrl ?? null,
    syncedAt: new Date(),
    publishedAt: record.publishedAt ?? existing?.publishedAt ?? null,
  };

  let result: IngestResult = "unchanged";

  if (!existing) {
    await prisma.paper.create({
      data: {
        id: record.paperId,
        ...data,
      },
    });
    result = "created";
  } else {
    const changed =
      existing.currentCommitSha !== record.sha ||
      existing.title !== data.title ||
      existing.abstract !== data.abstract ||
      existing.status !== data.status;
    if (changed) {
      await prisma.paper.update({ where: { id: record.paperId }, data });
      result = "updated";
    }
  }

  // Version snapshots: one row per commit sha, current flagged exactly once.
  const snapshots = [
    ...record.versions.map((version) => ({
      sha: version.sha,
      body: version.body,
      parentSha: version.parentSha ?? null,
      message: version.message ?? null,
      prNumber: version.prNumber ?? null,
      authorLogin: version.authorLogin ?? null,
      createdAt: version.createdAt,
      isCurrent: false,
    })),
    {
      sha: record.sha,
      body: record.body,
      parentSha: record.versions.at(-1)?.sha ?? null,
      message: existing ? `同步更新 ${record.sha.slice(0, 7)}` : "初始版本",
      prNumber: record.metadata.pr ?? null,
      authorLogin: authors.find((a) => a.login)?.login ?? null,
      createdAt: record.publishedAt ?? new Date(),
      isCurrent: true,
    },
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // A paper id may already have a version row for the same sha; upsert keeps
  // ingest idempotent across webhook retries.
  for (const snapshot of snapshots) {
    const version = await prisma.paperVersion.upsert({
      where: { paperId_commitSha: { paperId: record.paperId, commitSha: snapshot.sha } },
      create: {
        paperId: record.paperId,
        commitSha: snapshot.sha,
        parentSha: snapshot.parentSha,
        message: snapshot.message,
        prNumber: snapshot.prNumber,
        authorGithubId: null,
        authorLogin: snapshot.authorLogin,
        contentSha256: createHash("sha256").update(snapshot.body).digest("hex"),
        bodyMarkdown: snapshot.body,
        createdAt: snapshot.createdAt,
        isCurrent: snapshot.isCurrent,
      },
      update: {
        isCurrent: snapshot.isCurrent,
        bodyMarkdown: snapshot.body,
      },
    });
    if (snapshot.isCurrent) {
      await prisma.paper.update({
        where: { id: record.paperId },
        data: { currentVersionId: version.id },
      });
    }
  }

  const discussionResult = await ingestDiscussion(record.paperId, record.discussion, {
    authorLogins: Array.from(authorSet).filter((login): login is string => !!login),
  });

  const commentCount = discussionResult.commentCount || existing?.commentCount || 0;
  const lastActivity =
    discussionResult.lastActivity && discussionResult.lastActivity > (record.publishedAt ?? new Date(0))
      ? discussionResult.lastActivity
      : record.publishedAt ?? existing?.lastActivityAt ?? new Date();

  await prisma.paper.update({
    where: { id: record.paperId },
    data: { commentCount, lastActivityAt: lastActivity },
  });

  if (result === "created") {
    await prisma.auditLog.create({
      data: {
        actorLogin: options.actorLogin ?? "sync-worker",
        action: "paper.ingested",
        targetType: "paper",
        targetId: record.paperId,
        detailJson: JSON.stringify({
          source,
          sha: record.sha,
          status: data.status,
          authors: summarizeAuthors(authors),
        }),
      },
    });
  }

  return result;
}

export type LocalSyncReport = {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: Array<{ path: string; error: string }>;
};

/** Mirror `content/papers` into the database. Used by CLI and local sync. */
export async function syncLocalRepository(options: { actorLogin?: string } = {}): Promise<LocalSyncReport> {
  const records = loadLocalPapers();
  const report: LocalSyncReport = {
    scanned: records.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: [],
  };

  const deliveryId = `local-${randomUUID()}`;
  await prisma.syncEvent.create({
    data: {
      deliveryId,
      eventName: "local.scan",
      repoId: process.env.GITHUB_CONTENT_REPO || "local/content",
      payloadHash: createHash("sha256")
        .update(records.map((r) => r.contentSha256).join(":"))
        .digest("hex"),
      status: "PENDING",
    },
  });

  for (const record of records) {
    try {
      const result = await ingestPaper(record, {
        source: "local",
        actorLogin: options.actorLogin,
      });
      report[result] += 1;
    } catch (error) {
      report.failed.push({
        path: record.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await prisma.syncEvent.update({
    where: { deliveryId },
    data: {
      status: report.failed.length ? "FAILED" : "PROCESSED",
      processedAt: new Date(),
      error: report.failed.length ? JSON.stringify(report.failed).slice(0, 2000) : null,
    },
  });

  return report;
}

export function discussionSummary(record: PaperRecord): number {
  const count = (comments: DiscussionCommentInput[]): number =>
    comments.reduce(
      (total, comment) => total + 1 + (comment.replies ? count(comment.replies) : 0),
      0,
    );
  return count(record.discussion?.comments ?? []);
}

export function paperAuthors(paper: { authorsJson: string }): PaperAuthor[] {
  return parseAuthors(paper.authorsJson);
}
