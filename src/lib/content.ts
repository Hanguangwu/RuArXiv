import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { PAPER_STATUS, type PaperStatus } from "./constants";
import type { PaperAuthor } from "./serialize";

/**
 * The content repository contract.
 *
 * Every paper lives in an immutable directory:
 *   content/papers/<year>/<paperId>-<paperSlug>/
 *     paper.md          body, optionally with frontmatter
 *     metadata.yml      machine readable metadata (optional)
 *     discussion.json   exported GitHub issue + comments (optional)
 *     versions/*.md     older snapshots, each with `sha`/`date` frontmatter
 *
 * The same parser is used for local scanning and for files pulled from GitHub,
 * so switching the content source does not change the ingest path.
 */

export const authorSchema = z.object({
  name: z.string().min(1).max(160),
  login: z
    .string()
    .regex(/^[a-zA-Z0-9-]{1,39}$/)
    .optional(),
  orcid: z.string().max(32).optional(),
  affiliation: z.string().max(200).optional(),
});

export const paperMetadataSchema = z.object({
  id: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z_-]{5,39}$/, "id 必须是 6-40 位稳定标识"),
  title: z.string().min(4).max(240),
  abstract: z.string().max(6000).optional(),
  authors: z.array(authorSchema).min(1),
  categories: z.array(z.string().min(2).max(40)).min(1),
  keywords: z.array(z.string().max(60)).max(20).default([]),
  license: z.string().max(40).default("CC-BY-4.0"),
  language: z.string().max(16).default("zh-CN"),
  source_url: z.string().url().optional(),
  pdf_url: z.string().url().optional(),
  status: z.enum(["draft", "review", "published", "hidden"]).default("published"),
  published_at: z.string().optional(),
  discussion_issue: z.number().int().positive().optional(),
  commit: z.string().max(64).optional(),
  pr: z.number().int().positive().optional(),
  issue_url: z.string().url().optional(),
});

export type PaperMetadata = z.infer<typeof paperMetadataSchema>;

export type DiscussionCommentInput = {
  id?: string;
  author: string;
  body: string;
  createdAt?: string;
  reactions?: Record<string, number>;
  replies?: DiscussionCommentInput[];
};

export type DiscussionInput = {
  issueNumber?: number;
  issueUrl?: string;
  comments?: DiscussionCommentInput[];
};

export type ParsedVersion = {
  sha: string;
  parentSha?: string;
  message?: string;
  body: string;
  createdAt: Date;
  prNumber?: number;
  authorLogin?: string;
};

export type PaperRecord = {
  paperId: string;
  slug: string;
  repoId: string;
  path: string;
  metadata: PaperMetadata;
  body: string;
  abstract: string;
  sha: string;
  contentSha256: string;
  versions: ParsedVersion[];
  discussion?: DiscussionInput;
  status: PaperStatus;
  publishedAt: Date | null;
};

const STATUS_MAP: Record<PaperMetadata["status"], PaperStatus> = {
  draft: PAPER_STATUS.PENDING_REVIEW,
  review: PAPER_STATUS.PENDING_REVIEW,
  published: PAPER_STATUS.PUBLISHED,
  hidden: PAPER_STATUS.HIDDEN,
};

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentRoot(): string {
  return process.env.CONTENT_ROOT
    ? path.resolve(process.env.CONTENT_ROOT)
    : path.join(process.cwd(), "content");
}

export function slugify(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "paper";
}

function stripFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const parsed = matter(raw);
  return { data: parsed.data as Record<string, unknown>, body: parsed.content };
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function deriveAbstract(metadata: PaperMetadata, body: string): string {
  if (metadata.abstract?.trim()) return metadata.abstract.trim();
  const headingMatch = body.match(/##\s*(摘要|Abstract)\s*\n+([\s\S]*?)(\n##\s|$)/i);
  const candidate = headingMatch ? headingMatch[2] : body;
  return candidate
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

/**
 * Parse one paper directory. Throws with a readable message when metadata is
 * invalid so the validator worker can report it on the PR.
 */
export function parsePaperDirectory(dir: string, relativePath: string): PaperRecord {
  const paperMdPath = path.join(dir, "paper.md");
  if (!existsSync(paperMdPath)) {
    throw new Error(`${relativePath}: 缺少 paper.md`);
  }
  const raw = readFileSync(paperMdPath, "utf8");
  const { data: frontmatter, body } = stripFrontmatter(raw);

  const metadataPath = path.join(dir, "metadata.yml");
  const metadataSource = existsSync(metadataPath)
    ? (parseYaml(readFileSync(metadataPath, "utf8")) as Record<string, unknown>)
    : frontmatter;

  const parsed = paperMetadataSchema.safeParse(metadataSource);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "metadata"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${relativePath}: 元数据不合法 (${detail})`);
  }
  const metadata = parsed.data;

  const dirName = path.basename(dir);
  const match = dirName.match(/^([0-9A-Za-z][0-9A-Za-z_-]{5,39}?)-([a-z0-9-]+)$/);
  if (!match) {
    throw new Error(`${relativePath}: 目录名必须是 <paperId>-<slug>`);
  }
  const [, dirId, slug] = match;
  if (!dirId.startsWith(metadata.id)) {
    throw new Error(`${relativePath}: metadata.id 与目录前缀不一致`);
  }

  const versionsDir = path.join(dir, "versions");
  const versions: ParsedVersion[] = [];
  if (existsSync(versionsDir)) {
    for (const file of readdirSync(versionsDir).filter((f) => f.endsWith(".md")).sort()) {
      const snapshot = stripFrontmatter(readFileSync(path.join(versionsDir, file), "utf8"));
      const sha = String(snapshot.data.sha ?? file.replace(/\.md$/, ""));
      versions.push({
        sha,
        parentSha: snapshot.data.parent ? String(snapshot.data.parent) : undefined,
        message: snapshot.data.message ? String(snapshot.data.message) : undefined,
        body: snapshot.body,
        createdAt: parseDate(
          snapshot.data.date ? String(snapshot.data.date) : undefined,
          statSync(path.join(versionsDir, file)).mtime,
        ),
        prNumber: snapshot.data.pr ? Number(snapshot.data.pr) : undefined,
        authorLogin: snapshot.data.author ? String(snapshot.data.author) : undefined,
      });
    }
  }

  const discussionPath = path.join(dir, "discussion.json");
  const discussion = existsSync(discussionPath)
    ? (JSON.parse(readFileSync(discussionPath, "utf8")) as DiscussionInput)
    : undefined;

  const fallbackDate = parseDate(metadata.published_at, new Date());
  const sha = metadata.commit ?? sha256(`${JSON.stringify(metadata)}\n${body}`);
  const contentSha256 = sha256(`${JSON.stringify(metadata)}\n${body}`);

  return {
    paperId: metadata.id,
    slug,
    repoId: `papers/${relativePath}`,
    path: `${relativePath}/paper.md`,
    metadata,
    body,
    abstract: deriveAbstract(metadata, body),
    sha,
    contentSha256,
    versions,
    discussion,
    status: STATUS_MAP[metadata.status],
    publishedAt:
      metadata.status === "published" || metadata.status === "hidden"
        ? fallbackDate
        : null,
  };
}

/** Walk `content/papers/<year>/<paperId>-<slug>` directories. */
export function scanPaperDirectories(root = contentRoot()): Array<{
  dir: string;
  relativePath: string;
}> {
  const papersRoot = path.join(root, "papers");
  if (!existsSync(papersRoot)) return [];
  const out: Array<{ dir: string; relativePath: string }> = [];
  for (const year of readdirSync(papersRoot)) {
    const yearDir = path.join(papersRoot, year);
    if (!statSync(yearDir).isDirectory()) continue;
    for (const entry of readdirSync(yearDir)) {
      const dir = path.join(yearDir, entry);
      if (!statSync(dir).isDirectory()) continue;
      out.push({ dir, relativePath: `papers/${year}/${entry}` });
    }
  }
  return out;
}

export function loadLocalPapers(root = contentRoot()): PaperRecord[] {
  return scanPaperDirectories(root).map(({ dir, relativePath }) =>
    parsePaperDirectory(dir, relativePath),
  );
}

/** Load a paper from raw GitHub file contents (used by the sync worker). */
export function parsePaperFiles(input: {
  paperMarkdown: string;
  metadataYaml?: string;
  relativePath: string;
  discussionJson?: string;
  history?: Array<{ markdown: string; filename: string }>;
}): PaperRecord {
  const { data: frontmatter, body } = stripFrontmatter(input.paperMarkdown);
  const metadataRaw = input.metadataYaml
    ? (parseYaml(input.metadataYaml) as Record<string, unknown>)
    : frontmatter;
  const parsed = paperMetadataSchema.safeParse(metadataRaw);
  if (!parsed.success) {
    throw new Error(
      `${input.relativePath}: 元数据不合法 (${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")})`,
    );
  }
  const metadata = parsed.data;
  const dirName = input.relativePath.split("/").pop() ?? "";
  const match = dirName.match(/^([0-9A-Za-z][0-9A-Za-z_-]{5,39}?)-([a-z0-9-]+)$/);
  if (!match) throw new Error(`${input.relativePath}: 目录名必须是 <paperId>-<slug>`);
  const [, dirId, slug] = match;
  if (!dirId.startsWith(metadata.id)) {
    throw new Error(`${input.relativePath}: metadata.id 与目录前缀不一致`);
  }

  const versions = (input.history ?? []).map((item) => {
    const snapshot = stripFrontmatter(item.markdown);
    return {
      sha: String(snapshot.data.sha ?? item.filename.replace(/\.md$/, "")),
      parentSha: snapshot.data.parent ? String(snapshot.data.parent) : undefined,
      message: snapshot.data.message ? String(snapshot.data.message) : undefined,
      body: snapshot.body,
      createdAt: parseDate(
        snapshot.data.date ? String(snapshot.data.date) : undefined,
        new Date(),
      ),
      prNumber: snapshot.data.pr ? Number(snapshot.data.pr) : undefined,
      authorLogin: snapshot.data.author ? String(snapshot.data.author) : undefined,
    } satisfies ParsedVersion;
  });

  return {
    paperId: metadata.id,
    slug,
    repoId: input.relativePath,
    path: `${input.relativePath}/paper.md`,
    metadata,
    body,
    abstract: deriveAbstract(metadata, body),
    sha: metadata.commit ?? sha256(`${JSON.stringify(metadata)}\n${body}`),
    contentSha256: sha256(`${JSON.stringify(metadata)}\n${body}`),
    versions,
    discussion: input.discussionJson
      ? (JSON.parse(input.discussionJson) as DiscussionInput)
      : undefined,
    status: STATUS_MAP[metadata.status],
    publishedAt:
      metadata.status === "published" || metadata.status === "hidden"
        ? parseDate(metadata.published_at, new Date())
        : null,
  };
}

export function summarizeAuthors(authors: PaperAuthor[]): string {
  if (authors.length === 0) return "未知作者";
  if (authors.length <= 3) return authors.map((a) => a.name).join("、");
  return `${authors
    .slice(0, 3)
    .map((a) => a.name)
    .join("、")} 等 ${authors.length} 人`;
}
