import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createComment } from "@/lib/participation";
import { hasRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(user.role, "INVITED_USER")) {
    return NextResponse.json({ error: "invite_required" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { body?: string; parentId?: string }
    | null;
  if (!payload?.body) {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }

  const result = await createComment({
    user,
    paperId: id,
    body: payload.body,
    parentId: payload.parentId ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ id: result.data.commentId, source: "local" }, { status: 201 });
}
