import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./db";
import { COMMENT_STATUS, PAPER_STATUS } from "./constants";
import { contentRepoConfigured, createIssueComment } from "./github";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

const MAX_COMMENT_LENGTH = 5000;

export async function castVote(input: {
  userId: string;
  paperId: string;
  value: 1 | -1;
}): Promise<ActionResult<{ score: number; upvotes: number; downvotes: number; userVote: number }>> {
  if (input.value !== 1 && input.value !== -1) return { ok: false, error: "非法的投票值" };
  const paper = await prisma.paper.findUnique({ where: { id: input.paperId } });
  if (!paper) return { ok: false, error: "论文不存在" };
  if (paper.status !== PAPER_STATUS.PUBLISHED) return { ok: false, error: "该论文当前不可投票" };

  const existing = await prisma.vote.findUnique({
    where: { paperId_userId: { paperId: input.paperId, userId: input.userId } },
  });

  let delta = 0;
  let upDelta = 0;
  let downDelta = 0;
  let userVote: number = input.value;

  if (!existing) {
    await prisma.vote.create({
      data: { paperId: input.paperId, userId: input.userId, value: input.value, source: "LOCAL" },
    });
    delta = input.value;
    if (input.value === 1) upDelta = 1;
    else downDelta = 1;
  } else if (existing.value === input.value) {
    await prisma.vote.delete({ where: { id: existing.id } });
    delta = -input.value;
    if (input.value === 1) upDelta = -1;
    else downDelta = -1;
    userVote = 0;
  } else {
    await prisma.vote.update({ where: { id: existing.id }, data: { value: input.value } });
    delta = input.value * 2;
    if (input.value === 1) {
      upDelta = 1;
      downDelta = -1;
    } else {
      upDelta = -1;
      downDelta = 1;
    }
  }

  const updated = await prisma.paper.update({
    where: { id: input.paperId },
    data: {
      score: { increment: delta },
      upvotes: { increment: upDelta },
      downvotes: { increment: downDelta },
    },
    select: { score: true, upvotes: true, downvotes: true },
  });

  return { ok: true, data: { ...updated, userVote } };
}

export async function createComment(input: {
  user: { id: string; login: string; name: string | null; avatarUrl: string | null; role: string };
  paperId: string;
  body: string;
  parentId?: string | null;
}): Promise<ActionResult<{ commentId: string }>> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "评论不能为空" };
  if (body.length > MAX_COMMENT_LENGTH) return { ok: false, error: "评论超过 5000 字上限" };

  const paper = await prisma.paper.findUnique({ where: { id: input.paperId } });
  if (!paper) return { ok: false, error: "论文不存在" };

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.paperId !== input.paperId) {
      return { ok: false, error: "回复的评论不存在" };
    }
  }

  const recent = await prisma.comment.count({
    where: {
      localAuthorId: input.user.id,
      createdAt: { gt: new Date(Date.now() - 60_000) },
    },
  });
  if (recent >= 3) return { ok: false, error: "发送过于频繁，请稍后再试" };

  const paperAuthors = paper.authorLogins
    .split(",")
    .map((login) => login.trim().toLowerCase());

  const created = await prisma.comment.create({
    data: {
      paperId: input.paperId,
      parentId: input.parentId ?? null,
      authorLogin: input.user.login,
      authorName: input.user.name,
      authorAvatarUrl: input.user.avatarUrl,
      bodySnapshot: body,
      localAuthorId: input.user.id,
      isAuthor: paperAuthors.includes(input.user.login.toLowerCase()),
      status: COMMENT_STATUS.VISIBLE,
    },
  });

  // Best-effort mirror to the GitHub issue. Failures are queued for reconcile
  // instead of being surfaced to the reader.
  if (contentRepoConfigured() && paper.githubIssueNumber) {
    try {
      const remote = await createIssueComment(paper.githubIssueNumber, body);
      await prisma.comment.update({
        where: { id: created.id },
        data: { githubCommentId: String(remote.id) },
      });
    } catch (error) {
      await prisma.syncEvent.create({
        data: {
          deliveryId: `comment-mirror-${randomUUID()}`,
          eventName: "comment.mirror_failed",
          repoId: process.env.GITHUB_CONTENT_REPO ?? null,
          payloadHash: createHash("sha256").update(body).digest("hex"),
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 1000) : "unknown",
          processedAt: new Date(),
        },
      });
    }
  }

  await prisma.paper.update({
    where: { id: input.paperId },
    data: { commentCount: { increment: 1 }, lastActivityAt: new Date() },
  });

  return { ok: true, data: { commentId: created.id } };
}
