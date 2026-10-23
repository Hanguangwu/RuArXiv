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
import { COMMENT_STATUS, PAPER_STATUS, hasRole } from "@/lib/constants";
import { contentRoot, slugify } from "@/lib/content";
import { contentRepoConfigured, createPaperPullRequest } from "@/lib/github";
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

function parseAuthors(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, login, affiliation] = line.split("|").map((part) => part.trim());
      return {
        name: name || login || "匿名作者",
        ...(login ? { login: login.replace(/^@/, "").toLowerCase() } : {}),
        ...(affiliation ? { affiliation } : {}),
      };
    });
}

export async function createPaperAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (!hasRole(user.role, "AUTHOR")) {
    redirect(`/submit?error=${encodeURIComponent("只有作者角色可以提交论文，请联系管理员升级权限")}`);
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const abstract = formData.get("abstract")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString() ?? "";
  const authorsRaw = formData.get("authors")?.toString() ?? "";
  const categories = formData
    .getAll("categories")
    .map((value) => value.toString())
    .filter(Boolean);
  const keywords = formData
    .get("keywords")
    ?.toString()
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean) ?? [];
  const license = formData.get("license")?.toString() || "CC-BY-4.0";
  const language = formData.get("language")?.toString() || "zh-CN";
  const sourceUrl = formData.get("sourceUrl")?.toString().trim() || undefined;

  const authors = parseAuthors(authorsRaw);

  if (title.length < 4) redirect(`/submit?error=${encodeURIComponent("标题至少 4 个字")}`);
  if (body.trim().length < 200) {
    redirect(`/submit?error=${encodeURIComponent("正文至少 200 字，请包含摘要、方法与实验")}`);
  }
  if (authors.length === 0) redirect(`/submit?error=${encodeURIComponent("请至少填写一位作者")}`);
  if (categories.length === 0) redirect(`/submit?error=${encodeURIComponent("请选择至少一个分类")}`);
  if (/<script|javascript:/i.test(body)) {
    redirect(`/submit?error=${encodeURIComponent("正文包含不允许的脚本内容")}`);
  }

  const paperId = newPaperId();
  const slug = `${slugify(title)}-${paperId.slice(-4).toLowerCase()}`;
  const year = new Date().getFullYear();
  const relativeDir = `papers/${year}/${paperId}-${slug}`;
  const contentSha = createHash("sha256").update(body).digest("hex");

  const metadataYaml = [
    `id: "${paperId}"`,
    `title: ${JSON.stringify(title)}`,
    "authors:",
    ...authors.map((author) =>
      [
        `  - name: ${JSON.stringify(author.name)}`,
        "login" in author && author.login ? `    login: "${author.login}"` : null,
        "affiliation" in author && author.affiliation
          ? `    affiliation: ${JSON.stringify(author.affiliation)}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    `categories: [${categories.join(", ")}]`,
    `keywords: [${keywords.join(", ")}]`,
    `license: ${license}`,
    `language: ${language}`,
    "status: review",
    `published_at: "${new Date().toISOString()}"`,
    ...(sourceUrl ? [`source_url: ${JSON.stringify(sourceUrl)}`] : []),
    `commit: "${contentSha}"`,
  ].join("\n");

  // Persist into the local content repository so `pnpm sync` and the validator
  // see the same artifact a GitHub PR would contain.
  try {
    const dir = path.join(contentRoot(), relativeDir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "metadata.yml"), metadataYaml, "utf8");
    await writeFile(path.join(dir, "paper.md"), body, "utf8");
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
      title,
      abstract: abstract || body.replace(/[#*`>]/g, " ").replace(/\s+/g, " ").slice(0, 600),
      authorsJson: JSON.stringify(authors),
      authorLogins: authors
        .map((author) => ("login" in author ? author.login : undefined))
        .filter(Boolean)
        .join(","),
      categoriesJson: JSON.stringify(categories),
      keywordsJson: JSON.stringify(keywords),
      license,
      language,
      sourceUrl: sourceUrl ?? null,
      status: PAPER_STATUS.PENDING_REVIEW,
      currentCommitSha: contentSha,
      syncedAt: new Date(),
      submittedById: user.id,
      lastActivityAt: new Date(),
      versions: {
        create: {
          commitSha: contentSha,
          message: "网站提交（等待审核）",
          contentSha256: contentSha,
          bodyMarkdown: body,
          authorLogin: user.login,
          isCurrent: true,
        },
      },
    },
  });

  let prNote = "本地草稿";
  if (contentRepoConfigured()) {
    try {
      const pr = await createPaperPullRequest({
        branch: `paper/${paperId}`,
        title: `[Paper] ${title}`,
        body: `由 RuArXiv 网站提交。\n\npaperId: \`${paperId}\`\n作者: ${authors
          .map((author) => author.name)
          .join(", ")}\n\n> 合并后由 Webhook 触发同步并进入审核队列。`,
        files: [
          { path: `${relativeDir}/metadata.yml`, content: metadataYaml },
          { path: `${relativeDir}/paper.md`, content: body },
        ],
      });
      await prisma.paper.update({
        where: { id: paperId },
        data: { path: `${relativeDir}/paper.md` },
      });
      prNote = `PR #${pr.number}`;
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
    detail: { title, categories, authors: authors.map((a) => a.name), prNote },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/papers/${paperId}?submitted=1`);
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
  const { syncLocalRepository } = await import("@/lib/ingest");
  const report = await syncLocalRepository({ actorLogin: user.login });
  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "sync.local",
    targetType: "sync",
    targetId: null,
    detail: report,
  });
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(`/admin?synced=${report.created + report.updated}`);
}
