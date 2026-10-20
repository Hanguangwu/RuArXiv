import { NextResponse } from "next/server";
import { getCurrentUser, recordAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => null)) as
    | { reason?: string; detail?: string; commentId?: string }
    | null;
  if (!payload?.reason) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      paperId: id,
      commentId: payload.commentId ?? null,
      reporterId: user.id,
      reason: payload.reason.slice(0, 200),
      detail: payload.detail?.slice(0, 2000) ?? null,
      status: "OPEN",
    },
  });

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: "report.created",
    targetType: "paper",
    targetId: id,
    detail: { reason: payload.reason, reportId: report.id },
  });

  return NextResponse.json({ id: report.id, status: report.status }, { status: 201 });
}
