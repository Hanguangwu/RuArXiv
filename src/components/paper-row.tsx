import Link from "next/link";
import { ArrowUp, GitCommit, MessageSquare } from "lucide-react";
import type { PaperCard } from "@/lib/queries";
import { formatDate, timeAgo } from "@/lib/format";
import { categoryName } from "@/lib/constants";

export function PaperRow({ paper, index }: { paper: PaperCard; index?: number }) {
  return (
    <article className="paper-row">
      <div className="flex flex-col items-center gap-1 pt-1">
        {typeof index === "number" && (
          <span className="mb-1 hidden text-[0.68rem] tabular text-[var(--color-ink-faint)] sm:block">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <Link
          href={`/papers/${paper.id}`}
          className="flex flex-col items-center gap-0.5"
          aria-label={`${paper.title}，评分 ${paper.score}`}
        >
          <ArrowUp className="h-3.5 w-3.5 text-[var(--color-ink-faint)]" aria-hidden />
          <span className="tabular text-[0.95rem] font-semibold leading-none">{paper.score}</span>
        </Link>
        <span className="text-[0.6rem] text-[var(--color-ink-faint)]">分</span>
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-[var(--color-ink-faint)]">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
            {paper.categories[0] ? categoryName(paper.categories[0]) : "未分类"}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDate(paper.publishedAt)}</span>
          {paper.status !== "PUBLISHED" && (
            <>
              <span aria-hidden>·</span>
              <span className="chip chip-accent">{paper.status === "PENDING_REVIEW" ? "待审核" : paper.status === "HIDDEN" ? "已隐藏" : paper.status}</span>
            </>
          )}
        </div>

        <Link href={`/papers/${paper.id}`} className="paper-title">
          {paper.title}
        </Link>

        <p className="mt-1.5 text-[0.8rem] text-[var(--color-ink-soft)]">
          {paper.authors.map((author, authorIndex) => (
            <span key={`${author.name}-${authorIndex}`}>
              {author.login ? (
                <Link href={`/authors/${author.login}`} className="link-underline hover:text-[var(--color-accent)]">
                  {author.name}
                </Link>
              ) : (
                author.name
              )}
              {authorIndex < paper.authors.length - 1 ? "、" : ""}
            </span>
          ))}
          {paper.authors.length > 0 && paper.authors.some((a) => a.affiliation) && (
            <span className="text-[var(--color-ink-faint)]">
              {" "}
              · {paper.authors.find((a) => a.affiliation)?.affiliation}
            </span>
          )}
        </p>

        <p className="clamp-2 mt-2 text-[0.85rem] leading-relaxed text-[var(--color-ink-soft)]">
          {paper.abstract}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.7rem] text-[var(--color-ink-faint)]">
          {paper.categories.slice(1, 3).map((category) => (
            <Link key={category} href={`/categories/${category}`} className="chip">
              {category}
            </Link>
          ))}
          <Link
            href={`/papers/${paper.id}#discussion`}
            className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]"
          >
            <MessageSquare className="h-3 w-3" aria-hidden />
            {paper.commentCount} 条讨论
          </Link>
          <span className="inline-flex items-center gap-1">
            <GitCommit className="h-3 w-3" aria-hidden />
            {paper.versionCount} 个版本
          </span>
          <span className="hidden sm:inline">{paper.license}</span>
          <span className="ml-auto whitespace-nowrap">{timeAgo(paper.lastActivityAt)}</span>
        </div>
      </div>
    </article>
  );
}

export function PaperRowSkeleton() {
  return (
    <div className="paper-row animate-pulse">
      <div />
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-[var(--color-paper-sunk)]" />
        <div className="h-5 w-3/4 rounded bg-[var(--color-paper-sunk)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--color-paper-sunk)]" />
      </div>
    </div>
  );
}
