import { NextResponse } from "next/server";
import { listPapers } from "@/lib/queries";
import { isSortKey, PAPER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sortParam = url.searchParams.get("sort") ?? "latest";
  const result = await listPapers({
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    author: url.searchParams.get("author") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 12),
    sort: isSortKey(sortParam) ? sortParam : "latest",
    status: PAPER_STATUS.PUBLISHED,
  });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    nextCursor: result.nextCursor,
    meta: { source: "index", syncedAt: new Date().toISOString() },
  });
}
