import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { diffLines, diffStats } from "@/lib/diff";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: paperId } = await params;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from_and_to_required" }, { status: 400 });
  }

  const versions = await prisma.paperVersion.findMany({
    where: {
      paperId,
      OR: [{ id: from }, { commitSha: from }, { id: to }, { commitSha: to }],
    },
  });
  const oldVersion =
    versions.find((v) => v.id === from || v.commitSha === from) ?? null;
  const newVersion = versions.find((v) => v.id === to || v.commitSha === to) ?? null;

  if (!oldVersion || !newVersion) {
    return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  }

  const lines = diffLines(oldVersion.bodyMarkdown, newVersion.bodyMarkdown);
  return NextResponse.json({
    from: {
      id: oldVersion.id,
      commitSha: oldVersion.commitSha,
      createdAt: oldVersion.createdAt,
    },
    to: {
      id: newVersion.id,
      commitSha: newVersion.commitSha,
      createdAt: newVersion.createdAt,
    },
    stats: diffStats(lines),
    lines,
  });
}
