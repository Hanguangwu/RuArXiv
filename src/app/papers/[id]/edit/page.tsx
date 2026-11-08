import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updatePaperAction } from "@/app/actions";
import { deriveAbstract } from "@/lib/abstract";
import { getCurrentUser } from "@/lib/auth";
import { formatAuthorLines } from "@/lib/authors";
import { PAPER_STATUS, hasRole } from "@/lib/constants";
import { getPaperDetail } from "@/lib/queries";
import { parseAuthors } from "@/lib/serialize";
import { PaperFields } from "@/components/paper-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "修改论文" };

export default async function EditPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/papers/${id}/edit`)}`);

  const detail = await getPaperDetail(id);
  if (!detail) notFound();

  const isOwner = detail.raw.submittedById === viewer.id;
  const isModerator = hasRole(viewer.role, "MODERATOR");
  if (!isOwner && !isModerator) notFound();

  const { paper, raw, currentVersion } = detail;
  const body = currentVersion?.bodyMarkdown ?? "";
  // Older website submissions stored a naive 600-character body slice when the
  // author left the abstract empty. Showing that slice would make the author
  // save it as a "custom" abstract, so treat it as empty and let the normal
  // `## 摘要` extraction run again. An abstract that already equals the derived
  // value is also shown empty so editing the body keeps it in sync.
  const legacyFallback = body.replace(/[#*`>]/g, " ").replace(/\s+/g, " ").slice(0, 600);
  const derived = deriveAbstract("", body);
  const abstract =
    paper.abstract === legacyFallback || paper.abstract.trim() === derived ? "" : paper.abstract;
  const statusNote =
    paper.status === PAPER_STATUS.PUBLISHED
      ? "这篇论文已发布。保存后正文与元数据立即更新，并生成一个新的版本记录；如需重新审核，请先由管理员下架。"
      : paper.status === PAPER_STATUS.REJECTED || paper.status === PAPER_STATUS.HIDDEN
        ? "保存后论文会重新进入审核队列，管理员批准后再次公开。"
        : "这篇论文正在审核中。保存后会保持待审核，并生成新的版本记录。";

  return (
    <div className="container-page py-8">
      <header className="max-w-3xl border-b border-[var(--color-line)] pb-5">
        <p className="label">修订</p>
        <h1 className="mt-2 font-serif text-[2rem] font-semibold">修改论文</h1>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
          {paper.title}
        </p>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-[var(--color-ink-soft)]">{statusNote}</p>
      </header>

      {error && <div className="banner banner-error mt-5">{error}</div>}

      <form action={updatePaperAction} className="mt-7 max-w-3xl space-y-5">
        <input type="hidden" name="paperId" value={paper.id} />
        <PaperFields
          defaults={{
            title: paper.title,
            abstract,
            authors: formatAuthorLines(parseAuthors(raw.authorsJson)),
            body,
            categories: paper.categories,
            keywords: paper.keywords,
            license: paper.license,
            language: paper.language,
            sourceUrl: raw.sourceUrl ?? undefined,
          }}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-line)] pt-4">
          <button type="submit" className="btn btn-primary">
            保存修改
          </button>
          <Link href={`/papers/${paper.id}`} className="btn btn-outline">
            取消
          </Link>
          <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
            每次保存都会写入版本历史与审计日志。
          </span>
        </div>
      </form>
    </div>
  );
}
