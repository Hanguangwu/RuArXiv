import { NextResponse } from "next/server";
import { getVersions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const versions = await getVersions(id);
  return NextResponse.json({
    items: versions.map((version) => ({
      id: version.id,
      commitSha: version.commitSha,
      parentSha: version.parentSha,
      prNumber: version.prNumber,
      message: version.message,
      contentSha256: version.contentSha256,
      authorLogin: version.authorLogin,
      createdAt: version.createdAt,
      isCurrent: version.isCurrent,
    })),
  });
}
