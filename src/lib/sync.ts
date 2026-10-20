import "server-only";

import { createHash } from "node:crypto";
import type { PaperRecord } from "./content";
import { parsePaperFiles } from "./content";
import { ingestPaper, ingestDiscussion } from "./ingest";
import { prisma } from "./db";
import {
  contentRepoConfigured,
  fetchFile,
  fetchIssueDiscussion,
  fetchRepoTree,
  parseRepo,
} from "./github";

/**
 * Pull-side sync worker.
 *
 * GitHub is the content source of truth. This module reads the repository
 * tree, reconstructs paper records with the same parser used for local
 * content, and upserts them idempotently. Webhook events and the scheduled
 * reconcile both call `syncFromGitHub`.
 */

export type GitHubSyncReport = {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: Array<{ path: string; error: string }>;
  durationMs: number;
};

const PAPER_FILE = /^(papers\/\d{4}\/[^/]+)\/(paper\.md|metadata\.yml|discussion\.json|versions\/[^/]+\.md)$/;

export async function syncFromGitHub(options: { actorLogin?: string } = {}): Promise<GitHubSyncReport> {
  if (!contentRepoConfigured()) {
    throw new Error("GitHub 内容仓库未配置（GITHUB_CONTENT_REPO / GITHUB_TOKEN 或 GitHub App 凭据）");
  }
  const started = Date.now();
  const repo = parseRepo();
  const tree = await fetchRepoTree();
  const groups = new Map<string, Map<string, string>>();

  for (const node of tree) {
    if (!node.path) continue;
    const match = node.path.match(PAPER_FILE);
    if (!match) continue;
    const [, dir, file] = match;
    const bucket = groups.get(dir) ?? new Map<string, string>();
    bucket.set(file, node.path);
    groups.set(dir, bucket);
  }

  const report: GitHubSyncReport = {
    scanned: groups.size,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: [],
    durationMs: 0,
  };

  for (const [dir, bucket] of groups) {
    try {
      const paperPath = bucket.get("paper.md");
      if (!paperPath) throw new Error("缺少 paper.md");
      const metadataPath = bucket.get("metadata.yml");
      const discussionPath = bucket.get("discussion.json");

      const [paperMarkdown, metadataYaml, discussionJson, history] = await Promise.all([
        fetchFile(paperPath),
        metadataPath ? fetchFile(metadataPath) : Promise.resolve(undefined),
        discussionPath ? fetchFile(discussionPath) : Promise.resolve(undefined),
        Promise.all(
          Array.from(bucket.entries())
            .filter(([file]) => file.startsWith("versions/"))
            .map(async ([file, fullPath]) => ({
              filename: file.replace("versions/", ""),
              markdown: await fetchFile(fullPath),
            })),
        ),
      ]);

      const record: PaperRecord = parsePaperFiles({
        paperMarkdown,
        metadataYaml,
        discussionJson,
        relativePath: dir,
        history,
      });

      // Discussion lives in Issues, not files. Fetch it when the repo does not
      // carry an exported snapshot.
      if (!record.discussion && record.metadata.discussion_issue) {
        const issue = await fetchIssueDiscussion(record.metadata.discussion_issue);
        record.discussion = issue;
      }

      const result = await ingestPaper(record, {
        source: "github",
        actorLogin: options.actorLogin,
      });
      report[result] += 1;
    } catch (error) {
      report.failed.push({
        path: dir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (repo) {
    await prisma.syncEvent.create({
      data: {
        deliveryId: `github-pull-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        eventName: "reconcile",
        repoId: `${repo.owner}/${repo.repo}`,
        payloadHash: createHash("sha256").update(String(started)).digest("hex"),
        status: report.failed.length ? "FAILED" : "PROCESSED",
        processedAt: new Date(),
        error: report.failed.length ? JSON.stringify(report.failed).slice(0, 2000) : null,
      },
    });
  }

  report.durationMs = Date.now() - started;
  return report;
}

/** Refresh a single discussion issue (fast path for `issue_comment` events). */
export async function syncIssueDiscussion(issueNumber: number) {
  const paper = await prisma.paper.findFirst({ where: { githubIssueNumber: issueNumber } });
  if (!paper) return { updated: false, reason: "no_paper_for_issue" as const };
  const issue = await fetchIssueDiscussion(issueNumber);
  const result = await ingestDiscussion(paper.id, issue, {
    authorLogins: paper.authorLogins.split(","),
  });
  await prisma.paper.update({
    where: { id: paper.id },
    data: {
      commentCount: result.commentCount,
      lastActivityAt: result.lastActivity ?? paper.lastActivityAt,
      discussionUrl: issue.issueUrl,
    },
  });
  return { updated: true, comments: result.commentCount };
}
