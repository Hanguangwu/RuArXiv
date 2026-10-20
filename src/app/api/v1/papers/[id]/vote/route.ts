import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { castVote } from "@/lib/participation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => null)) as { value?: number } | null;
  if (payload?.value !== 1 && payload?.value !== -1) {
    return NextResponse.json({ error: "value_must_be_1_or_-1" }, { status: 400 });
  }

  const result = await castVote({ userId: user.id, paperId: id, value: payload.value });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}
