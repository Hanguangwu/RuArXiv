import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { syncFromGitHub } from "@/lib/sync";
import { syncLocalRepository } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual reconcile endpoint used by the admin page and cron. */
export async function POST(request: Request) {
  const token = request.headers.get("x-sync-token");
  const cronAllowed = Boolean(process.env.SYNC_TOKEN && token === process.env.SYNC_TOKEN);
  const user = cronAllowed ? null : await getCurrentUser();

  if (!cronAllowed && (!user || !hasRole(user.role, "MODERATOR"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const report = await syncFromGitHub({ actorLogin: user?.login ?? "cron" });
    return NextResponse.json({ ok: true, source: "github", report });
  } catch (error) {
    // Without GitHub credentials, fall back to the local content mirror so the
    // endpoint remains useful in demo mode.
    const report = await syncLocalRepository({ actorLogin: user?.login ?? "cron" });
    return NextResponse.json({
      ok: true,
      source: "local",
      note: error instanceof Error ? error.message : "github unavailable",
      report,
    });
  }
}
