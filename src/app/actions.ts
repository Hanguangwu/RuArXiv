"use server";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  demoLoginEnabled,
  destroySession,
  getCurrentUser,
  recordAudit,
  signInAsDemo,
  type DemoRole,
} from "@/lib/auth";
import { CATEGORIES, COMMENT_STATUS, LICENSE_LABELS, PAPER_STATUS, hasRole } from "@/lib/constants";
import { deriveAbstract } from "@/lib/abstract";
import { parseAuthorText, type AuthorDraft } from "@/lib/authors";
import { contentRoot, slugify } from "@/lib/content";
import { authorLogins } from "@/lib/serialize";
import { contentRepoConfigured, submitPaperFiles } from "@/lib/github";
import { castVote, createComment } from "@/lib/participation";

const maxCommentLength = 5000;

function revalidatePaper(paperId: string) {
  revalidatePath("/");
  revalidatePath("/rankings");
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/admin");
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

export async function loginDemoAction(formData: FormData) {
  if (!demoLoginEnabled()) redirect("/login?error=demo_disabled");
  const kind = (formData.get("kind")?.toString() as DemoRole) || "reader";
  const next = safeNext(formData.get("next")?.toString());
  await signInAsDemo(kind);
  redirect(next);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/* -------------------------------------------------------------------------- */
/* Voting                                                                      */
/* -------------------------------------------------------------------------- */

export type VoteResult = {
  ok: boolean;
  error?: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  userVote?: number;
};

export async function voteAction(paperId: string, value: 1 | -1): Promise<VoteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先使用 GitHub 登录" };

  const result = await castVote({ userId: user.id, paperId, value });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePaper(paperId);
  return { ok: true, ...result.data };
}

/* -------------------------------------------------------------------------- */
/* Discussion                                                                  */
/* -------------------------------------------------------------------------- */

export async function commentAction(formData: FormData) {
  const user = await getCurrentUser();
  const paperId = formData.get("paperId")?.toString() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";
  const parentId = formData.get("parentId")?.toString() || null;

  if (!user) redirect(`/login?next=${encodeURIComponent(`/papers/${paperId}`)}`);
  if (!hasRole(user.role, "INVITED_USER")) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent("当前账号没有评论权限，请联系管理员获取邀请")}`);
  }
  if (body.length > maxCommentLength) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent("评论超过 5000 字上限")}`);
  }

  const result = await createComment({ user, paperId, body, parentId });
  if (!result.ok) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent(result.error)}`);
  }

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "comment.created",
    targetType: "comment",
    targetId: result.data.commentId,
    detail: { paperId, parentId, length: body.length },
  });

  revalidatePaper(paperId);
  redirect(`/papers/${paperId}#discussion`);
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export async function reportAction(formData: FormData) {
  const user = await getCurrentUser();
  const paperId = formData.get("paperId")?.toString() || null;
  const commentId = formData.get("commentId")?.toString() || null;
  const reason = formData.get("reason")?.toString() || "其他";
  const detail = formData.get("detail")?.toString().slice(0, 2000) || null;

  if (!user) redirect(`/login?next=${encodeURIComponent(paperId ? `/papers/${paperId}` : "/")}`);
  if (!paperId && !commentId) redirect("/");

  await prisma.report.create({
    data: { paperId, commentId, reporterId: user.id, reason, detail, status: "OPEN" },
  });
  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "report.created",
    targetType: paperId ? "paper" : "comment",
    targetId: paperId ?? commentId,
    detail: { reason },
  });
  revalidatePath("/admin");
  redirect(`${paperId ? `/papers/${paperId}` : "/"}?reported=1`);
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                  */
/* -------------------------------------------------------------------------- */

function newPaperId(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = Date.now();
  let stamp = "";
  for (let i = 0; i < 10; i += 1) {
    stamp = alphabet[time % 32] + stamp;
    time = Math.floor(time / 32);
  }
  const random = Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * 32)]).join("");
  return `${stamp}${random}`;
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

type PaperFormValues = {
  title: string;
  body: string;
  /** What the author typed; empty means "derive from the body". */
  explicitAbstract: string;
  /** Final abstract stored in the database. */
  abstract: string;
  authors: AuthorDraft[];
  categories: string[];
  keywords: string[];
  license: string;
  language: string;
  sourceUrl?: string;
};

type PaperFormResult =
  | { ok: true; values: PaperFormValues }
  | { ok: false; error: string };

/**
 * Validate the submit/edit form. Both actions use it so a revision can never
 * drift from what a fresh submission accepts.
 */
function parsePaperForm(formData: FormData): PaperFormResult {
  const title = formData.get("title")?.toString().trim() ?? "";
  const explicitAbstract = formData.get("abstract")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString() ?? "";
  const categories = formData
    .getAll("categories")
    .map((value) => value.toString())
    .filter(Boolean);
  const keywords = parseKeywords(formData.get("keywords")?.toString() ?? "");
  const license = formData.get("license")?.toString() || "CC-BY-4.0";
  const language = formData.get("language")?.toString() || "zh-CN";
  const sourceUrl = formData.get("sourceUrl")?.toString().trim() || undefined;

  if (title.length < 4 || title.length > 240) {
    return { ok: false, error: "标题需要 4–240 个字" };
  }
  if (body.trim().length < 200) {
    return { ok: false, error: "正文至少 200 字，请包含摘要、方法与实验" };
  }
  if (body.length > 400_000) {
    return { ok: false, error: "正文超过 400KB 上限" };
  }
  if (explicitAbstract.length > 6000) {
    return { ok: false, error: "摘要超过 6000 字上限" };
  }
  if (/<script|javascript:/i.test(body)) {
    return { ok: false, error: "正文包含不允许的脚本内容" };
  }

  const parsedAuthors = parseAuthorText(formData.get("authors")?.toString() ?? "");
  if (!parsedAuthors.ok) return parsedAuthors;

  if (categories.length === 0) {
    return { ok: false, error: "请选择至少一个分类" };
  }
  const allowedCategories = new Set(CATEGORIES.map((category) => category.slug));
  const unknownCategories = categories.filter((category) => !allowedCategories.has(category));
  if (unknownCategories.length) {
    return { ok: false, error: `未知分类：${unknownCategories.join("、")}` };
  }

  if (keywords.length > 20) {
    return { ok: false, error: "关键词最多 20 个" };
  }
  const longKeyword = keywords.find((keyword) => keyword.length > 60);
  if (longKeyword) {
    return { ok: false, error: `关键词「${longKeyword.slice(0, 20)}」超过 60 字` };
  }

  if (!Object.prototype.hasOwnProperty.call(LICENSE_LABELS, license)) {
    return { ok: false, error: "不支持的许可协议" };
  }
  if (language.length > 16) {
    return { ok: false, error: "语言标识不合法" };
  }
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
    } catch {
      return { ok: false, error: "原始来源必须是 http(s) 链接" };
    }
  }

  return {
    ok: true,
    values: {
      title,
      body,
      explicitAbstract,
      abstract: deriveAbstract(explicitAbstract, body),
      authors: parsedAuthors.authors,
      categories,
      keywords,
      license,
      language,
      sourceUrl,
    },
  };
}

/**
 * Stable revision id for a paper. It covers the metadata and the body so a
 * title-only revision still produces a new version, and it is written into
 * `metadata.yml` as `commit` so the sync worker reproduces the same value.
 */
function contentRevisionSha(values: PaperFormValues): string {
  const fingerprint = {
    title: values.title,
    abstract: values.explicitAbstract,
    authors: values.authors,
    categories: values.categories,
    keywords: values.keywords,
    license: values.license,
    language: values.language,
    sourceUrl: values.sourceUrl ?? null,
  };
  return createHash("sha256")
    .update(`${JSON.stringify(fingerprint)}\n${values.body}`)
    .digest("hex");
}

function buildMetadataYaml(input: {
  paperId: string;
  values: PaperFormValues;
  status: "review" | "published" | "hidden";
  publishedAt: string;
  commit: string;
}): string {
  const { paperId, values } = input;
  const lines = [
    `id: ${JSON.stringify(paperId)}`,
    `title: ${JSON.stringify(values.title)}`,
  ];
  if (values.explicitAbstract) {
    lines.push(`abstract: ${JSON.stringify(values.explicitAbstract)}`);
  }
  lines.push(
    "authors:",
    ...values.authors.map((author) =>
      [
        `  - name: ${JSON.stringify(author.name)}`,
        author.login ? `    login: ${JSON.stringify(author.login)}` : null,
        author.affiliation ? `    affiliation: ${JSON.stringify(author.affiliation)}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    ),
    `categories: [${values.categories.map((category) => JSON.stringify(category)).join(", ")}]`,
    `keywords: [${values.keywords.map((keyword) => JSON.stringify(keyword)).join(", ")}]`,
    `license: ${JSON.stringify(values.license)}`,
    `language: ${JSON.stringify(values.language)}`,
    `status: ${input.status}`,
    `published_at: ${JSON.stringify(input.publishedAt)}`,
  );
  if (values.sourceUrl) lines.push(`source_url: ${JSON.stringify(values.sourceUrl)}`);
  lines.push(`commit: ${JSON.stringify(input.commit)}`);
  return `${lines.join("\n")}\n`;
}

export async function createPaperAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (!hasRole(user.role, "AUTHOR")) {
    redirect(`/submit?error=${encodeURIComponent("只有作者角色可以提交论文，请联系管理员升级权限")}`);
  }

  const parsed = parsePaperForm(formData);
  if (!parsed.ok) redirect(`/submit?error=${encodeURIComponent(parsed.error)}`);
  const values = parsed.values;

  const paperId = newPaperId();
  const slug = `${slugify(values.title)}-${paperId.slice(-4).toLowerCase()}`;
  const year = new Date().getFullYear();
  const relativeDir = `papers/${year}/${paperId}-${slug}`;
  const commit = contentRevisionSha(values);
  const contentSha = createHash("sha256").update(values.body).digest("hex");
  const metadataYaml = buildMetadataYaml({
    paperId,
    values,
    status: "review",
    publishedAt: new Date().toISOString(),
    commit,
  });

  // Persist into the local content repository so `pnpm sync` and the validator
  // see the same artifact a GitHub PR would contain.
  try {
    const dir = path.join(contentRoot(), relativeDir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "metadata.yml"), metadataYaml, "utf8");
    await writeFile(path.join(dir, "paper.md"), values.body, "utf8");
  } catch (error) {
    await recordAudit({
      actorId: user.id,
      actorLogin: user.login,
      action: "paper.content_write_failed",
      targetType: "paper",
      targetId: paperId,
      detail: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  await prisma.paper.create({
    data: {
      id: paperId,
      slug,
      repoId: relativeDir,
      path: `${relativeDir}/paper.md`,
      title: values.title,
      abstract: values.abstract,
      authorsJson: JSON.stringify(values.authors),
      authorLogins: authorLogins(values.authors),
      categoriesJson: JSON.stringify(values.categories),
      keywordsJson: JSON.stringify(values.keywords),
      license: values.license,
      language: values.language,
      sourceUrl: values.sourceUrl ?? null,
      status: PAPER_STATUS.PENDING_REVIEW,
      currentCommitSha: commit,
      syncedAt: new Date(),
      submittedById: user.id,
      lastActivityAt: new Date(),
      versions: {
        create: {
          commitSha: commit,
          message: "网站提交（等待审核）",
          contentSha256: contentSha,
          bodyMarkdown: values.body,
          authorLogin: user.login,
          isCurrent: true,
        },
      },
    },
  });

  let prNote = "本地草稿";
  if (contentRepoConfigured()) {
    try {
      const submission = await submitPaperFiles({
        title: values.title,
        body: `由 RuArXiv 网站提交。\n\npaperId: \`${paperId}\`\n作者: ${values.authors
          .map((author) => author.name)
          .join(", ")}\n\n> 合并后由 Webhook 触发同步并进入审核队列。`,
        files: [
          { path: `${relativeDir}/metadata.yml`, content: metadataYaml },
          { path: `${relativeDir}/paper.md`, content: values.body },
        ],
      });
      prNote = `PR #${submission.number}（${submission.branch}，${
        submission.merge === "merged"
          ? "已自动合并"
          : submission.merge === "auto"
            ? "已开启自动合并"
            : "等待手动合并"
      }）`;
      await prisma.paperVersion.update({
        where: { paperId_commitSha: { paperId, commitSha: commit } },
        data: { prNumber: submission.number },
      });
    } catch (error) {
      prNote = `PR 创建失败：${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "paper.submitted",
    targetType: "paper",
    targetId: paperId,
    detail: { title: values.title, categories: values.categories, authors: values.authors.map((a) => a.name), prNote },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/papers/${paperId}?submitted=1`);
}

/**
 * Edit an existing paper. The author of the paper and moderators may revise it;
 * every revision creates a new `PaperVersion` and (when GitHub is configured) a
 * fresh pull request. Synchronisation never overwrites the site-owned review
 * status, so editing a rejected paper moves it back into the review queue.
 */
export async function updatePaperAction(formData: FormData) {
  const paperId = formData.get("paperId")?.toString() ?? "";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/papers/${paperId}/edit`)}`);

  const paper = await prisma.paper.findUnique({ where: { id: paperId } });
  if (!paper) redirect(`/?error=${encodeURIComponent("论文不存在或已被删除")}`);

  const isModerator = hasRole(user.role, "MODERATOR");
  const isOwner = paper.submittedById === user.id;
  if (!isOwner && !isModerator) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent("你没有修改这篇论文的权限")}`);
  }

  const parsed = parsePaperForm(formData);
  if (!parsed.ok) {
    redirect(`/papers/${paperId}/edit?error=${encodeURIComponent(parsed.error)}`);
  }
  const values = parsed.values;
  const commit = contentRevisionSha(values);

  const nextStatus = isModerator
    ? paper.status
    : paper.status === PAPER_STATUS.REJECTED || paper.status === PAPER_STATUS.HIDDEN
      ? PAPER_STATUS.PENDING_REVIEW
      : paper.status;
  const metadataStatus: "review" | "published" | "hidden" =
    nextStatus === PAPER_STATUS.PUBLISHED
      ? "published"
      : nextStatus === PAPER_STATUS.HIDDEN
        ? "hidden"
        : "review";
  const now = new Date();
  const publishedAt = (paper.publishedAt ?? now).toISOString();
  const metadataYaml = buildMetadataYaml({
    paperId,
    values,
    status: metadataStatus,
    publishedAt,
    commit,
  });
  const contentPath = paper.repoId || paper.path.replace(/\/paper\.md$/, "");

  const version = await prisma.$transaction(async (tx) => {
    const saved = await tx.paperVersion.upsert({
      where: { paperId_commitSha: { paperId, commitSha: commit } },
      create: {
        paperId,
        commitSha: commit,
        parentSha: paper.currentCommitSha,
        message: isModerator ? "管理员修订" : "作者修订",
        contentSha256: createHash("sha256").update(values.body).digest("hex"),
        bodyMarkdown: values.body,
        authorLogin: user.login,
        isCurrent: true,
      },
      update: { bodyMarkdown: values.body, isCurrent: true },
    });

    await tx.paperVersion.updateMany({
      where: { paperId, isCurrent: true, NOT: { id: saved.id } },
      data: { isCurrent: false },
    });

    await tx.paper.update({
      where: { id: paperId },
      data: {
        title: values.title,
        abstract: values.abstract,
        authorsJson: JSON.stringify(values.authors),
        authorLogins: authorLogins(values.authors),
        categoriesJson: JSON.stringify(values.categories),
        keywordsJson: JSON.stringify(values.keywords),
        license: values.license,
        language: values.language,
        sourceUrl: values.sourceUrl ?? null,
        status: nextStatus,
        currentCommitSha: commit,
        currentVersionId: saved.id,
        syncedAt: now,
        lastActivityAt: now,
        publishedAt:
          nextStatus === PAPER_STATUS.PUBLISHED ? (paper.publishedAt ?? now) : paper.publishedAt,
      },
    });

    return saved;
  });

  let prNote = contentRepoConfigured() ? "未创建 PR" : "未配置 GitHub 内容仓库";
  if (contentRepoConfigured()) {
    try {
      const submission = await submitPaperFiles({
        title: `修订：${values.title}`,
        body: `由 RuArXiv 网站提交论文修订。\n\npaperId: \`${paperId}\`\ncommit: \`${commit}\`\n\n> 合并后由 Webhook 同步；站内审核状态不会被同步覆盖。`,
        files: [
          { path: `${contentPath}/metadata.yml`, content: metadataYaml },
          { path: `${contentPath}/paper.md`, content: values.body },
        ],
      });
      await prisma.paperVersion.update({
        where: { id: version.id },
        data: { prNumber: submission.number },
      });
      prNote = `PR #${submission.number}（${submission.branch}，${
        submission.merge === "merged"
          ? "已自动合并"
          : submission.merge === "auto"
            ? "已开启自动合并"
            : "等待手动合并"
      }）`;
    } catch (error) {
      prNote = `PR 创建失败：${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "paper.updated",
    targetType: "paper",
    targetId: paperId,
    detail: { title: values.title, sha: commit, status: nextStatus, prNote },
  });

  revalidatePaper(paperId);
  redirect(`/papers/${paperId}?updated=1`);
}

/* -------------------------------------------------------------------------- */
/* Moderation                                                                  */
/* -------------------------------------------------------------------------- */

export async function moderatePaperAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "MODERATOR")) redirect("/login?error=forbidden");
  const paperId = formData.get("paperId")?.toString() ?? "";
  const action = formData.get("action")?.toString() ?? "";
  const reason = formData.get("reason")?.toString() || null;

  const allowed = ["approve", "hide", "restore", "reject"] as const;
  if (!allowed.includes(action as (typeof allowed)[number])) {
    redirect("/admin?error=unknown_action");
  }

  const paper = await prisma.paper.findUnique({ where: { id: paperId } });
  if (!paper) redirect("/admin?error=not_found");

  const nextStatus =
    action === "approve"
      ? PAPER_STATUS.PUBLISHED
      : action === "reject"
        ? PAPER_STATUS.REJECTED
        : action === "hide"
          ? PAPER_STATUS.HIDDEN
          : PAPER_STATUS.PUBLISHED;

  await prisma.paper.update({
    where: { id: paperId },
    data: {
      status: nextStatus,
      publishedAt: nextStatus === PAPER_STATUS.PUBLISHED ? paper.publishedAt ?? new Date() : paper.publishedAt,
    },
  });

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: `paper.${action}`,
    targetType: "paper",
    targetId: paperId,
    detail: { reason, from: paper.status, to: nextStatus },
  });

  revalidatePaper(paperId);
  redirect("/admin?ok=1");
}

export async function resolveReportAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "MODERATOR")) redirect("/login?error=forbidden");
  const reportId = formData.get("reportId")?.toString() ?? "";
  const resolution = formData.get("resolution")?.toString() ?? "已处理";
  const decision = formData.get("decision")?.toString() === "dismiss" ? "DISMISSED" : "RESOLVED";

  const report = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: decision,
      resolvedAt: new Date(),
      resolvedById: user.id,
      resolution,
    },
  });

  if (report.commentId && decision === "RESOLVED") {
    await prisma.comment.update({
      where: { id: report.commentId },
      data: { status: COMMENT_STATUS.HIDDEN },
    });
  }

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "report.resolved",
    targetType: "report",
    targetId: reportId,
    detail: { decision, resolution },
  });

  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

/* -------------------------------------------------------------------------- */
/* Sync                                                                        */
/* -------------------------------------------------------------------------- */

export async function syncNowAction() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "MODERATOR")) redirect("/login?error=forbidden");
  const { syncFromGitHub } = await import("@/lib/sync");
  const { syncLocalRepository } = await import("@/lib/ingest");

  let source: "github" | "local" = "local";
  let report: { created: number; updated: number; failed: Array<{ path: string; error: string }> };
  if (contentRepoConfigured()) {
    try {
      report = await syncFromGitHub({ actorLogin: user.login });
      source = "github";
    } catch {
      report = await syncLocalRepository({ actorLogin: user.login });
    }
  } else {
    report = await syncLocalRepository({ actorLogin: user.login });
  }

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: `sync.${source}`,
    targetType: "sync",
    targetId: null,
    detail: report,
  });
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(`/admin?synced=${report.created + report.updated}&source=${source}`);
}
