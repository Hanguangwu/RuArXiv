import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPaperDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const detail = await getPaperDetail(id, viewer?.id);
  if (!detail) {
    return NextResponse.json({ error: "paper_not_found" }, { status: 404 });
  }
  if (detail.paper.status !== "PUBLISHED" && !viewer) {
    return NextResponse.json({ error: "paper_not_public" }, { status: 403 });
  }

  return NextResponse.json({
    paper: detail.paper,
    versions: detail.versions.map((version) => ({
      id: version.id,
      commitSha: version.commitSha,
      parentSha: version.parentSha,
      prNumber: version.prNumber,
      message: version.message,
      createdAt: version.createdAt,
      isCurrent: version.isCurrent,
    })),
    votes: detail.votes,
    userVote: detail.userVote,
    comments: detail.comments,
    provenance: {
      source: "github",
      discussionUrl: detail.raw.discussionUrl,
      commitSha: detail.raw.currentCommitSha,
      syncedAt: detail.raw.syncedAt,
      path: detail.raw.path,
    },
  });
}
