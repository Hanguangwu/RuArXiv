import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/github";
import { syncFromGitHub, syncIssueDiscussion } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GitHub App webhook receiver.
 *
 * The request is verified and de-duplicated before any work happens. In this
 * MVP the sync runs inline after the event row is written; production should
 * enqueue `deliveryId` and return 202 immediately (see README).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  const eventName = request.headers.get("x-github-event") ?? "unknown";
  if (!deliveryId) {
    return NextResponse.json({ error: "missing_delivery_id" }, { status: 400 });
  }

  const existing = await prisma.syncEvent.findUnique({ where: { deliveryId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, status: existing.status }, { status: 202 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = await prisma.syncEvent.create({
    data: {
      deliveryId,
      eventName,
      repoId:
        typeof payload.repository === "object" && payload.repository
          ? ((payload.repository as { full_name?: string }).full_name ?? null)
          : null,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
      status: "PENDING",
    },
  });

  try {
    if (eventName === "push" || eventName === "issues") {
      const report = await syncFromGitHub({ actorLogin: "github-webhook" });
      await prisma.syncEvent.update({
        where: { id: event.id },
        data: {
          status: report.failed.length ? "FAILED" : "PROCESSED",
          processedAt: new Date(),
          error: report.failed.length ? JSON.stringify(report.failed).slice(0, 2000) : null,
        },
      });
      return NextResponse.json({ ok: true, report });
    }

    if (eventName === "issue_comment") {
      const issue = payload.issue as { number?: number } | undefined;
      if (issue?.number) {
        const result = await syncIssueDiscussion(issue.number);
        await prisma.syncEvent.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
        return NextResponse.json({ ok: true, result });
      }
    }

    await prisma.syncEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        error: `ignored event: ${eventName}`,
      },
    });
    return NextResponse.json({ ok: true, ignored: true });
  } catch (error) {
    await prisma.syncEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 2000) : "unknown",
        retryCount: { increment: 1 },
      },
    });
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
