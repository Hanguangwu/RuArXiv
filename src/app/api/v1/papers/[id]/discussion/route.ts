import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaperDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") === "top" ? "top" : "oldest";
  const detail = await getPaperDetail(id);

  if (!detail) {
    return NextResponse.json({ error: "paper_not_found" }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { paperId: detail.raw.id, status: "VISIBLE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      parentId: true,
      authorLogin: true,
      bodySnapshot: true,
      reactionsJson: true,
      isAuthor: true,
      createdAt: true,
    },
  });

  const scoreOf = (raw: string) => {
    try {
      const value = JSON.parse(raw) as Record<string, number>;
      return Object.values(value).reduce((sum, n) => sum + n, 0);
    } catch {
      return 0;
    }
  };

  const roots = comments.filter((comment) => !comment.parentId);
  roots.sort((a, b) =>
    sort === "top"
      ? scoreOf(b.reactionsJson) - scoreOf(a.reactionsJson)
      : a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return NextResponse.json({
    issue: {
      number: detail.raw.githubIssueNumber,
      url: detail.raw.discussionUrl,
    },
    sort,
    total: comments.length,
    items: roots.map((root) => ({
      ...root,
      reactions: JSON.parse(root.reactionsJson || "{}") as Record<string, number>,
      replies: comments
        .filter((comment) => comment.parentId === root.id)
        .map((reply) => ({
          ...reply,
          reactions: JSON.parse(reply.reactionsJson || "{}") as Record<string, number>,
        })),
    })),
  });
}
