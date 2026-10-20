import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCommit } from "lucide-react";
import { getPaperDetail } from "@/lib/queries";
import { diffLines, diffStats } from "@/lib/diff";
import { formatDateTime, shortSha } from "@/lib/format";
import { Markdown } from "@/components/markdown";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getPaperDetail(id);
  return { title: detail ? `${detail.paper.title} · 版本历史` : "版本历史" };
}

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPaperDetail(id);
  if (!detail) notFound();

  const ordered = [...detail.versions].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <div className="container-page max-w-4xl py-8">
      <Link href={`/papers/${id}`} className="inline-flex items-center gap-1 text-[0.75rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
        <ArrowLeft className="h-3 w-3" aria-hidden />
        返回论文
      </Link>

      <header className="mt-4 border-b border-[var(--color-line)] pb-5">
        <p className="label">版本历史</p>
        <h1 className="mt-2 font-serif text-[1.8rem] font-semibold leading-tight">
          {detail.paper.title}
        </h1>
        <p className="mt-2 text-[0.8rem] text-[var(--color-ink-soft)]">
          {ordered.length} 个版本，按合并顺序排列。每个版本对应一个 commit，正文快照保存在站内索引中，原始证据保留在 GitHub。
        </p>
      </header>

      <ol className="mt-6 space-y-5">
        {ordered.map((version, index) => {
          const older = ordered[index + 1];
          const diff = older ? diffLines(older.bodyMarkdown, version.bodyMarkdown) : null;
          const stats = diff ? diffStats(diff) : null;
          return (
            <li key={version.id} className="border border-[var(--color-line)] bg-[var(--color-paper-raised)]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-line)] px-4 py-3">
                <GitCommit className="h-3.5 w-3.5 text-[var(--color-ink-faint)]" aria-hidden />
                <span className="mono text-[0.72rem]">{shortSha(version.commitSha)}</span>
                {version.isCurrent && <span className="chip chip-moss">当前版本</span>}
                <span className="text-[0.78rem] font-medium">
                  {version.message ?? "同步版本"}
                </span>
                <span className="ml-auto flex items-center gap-3 text-[0.7rem] text-[var(--color-ink-faint)]">
                  {version.prNumber && <span className="mono">PR #{version.prNumber}</span>}
                  <time dateTime={version.createdAt.toISOString()}>
                    {formatDateTime(version.createdAt)}
                  </time>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.7rem] text-[var(--color-ink-faint)]">
                {version.authorLogin && <span>作者 @{version.authorLogin}</span>}
                <span className="mono">sha256 {version.contentSha256.slice(0, 12)}</span>
                {stats && (
                  <span className="tabular">
                    +{stats.added} / −{stats.removed} 行
                  </span>
                )}
                {older && (
                  <a
                    href={`/api/v1/papers/${detail.paper.id}/diff?from=${older.id}&to=${version.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--color-accent)]"
                  >
                    原始 diff JSON
                  </a>
                )}
                <details className="ml-auto">
                  <summary className="text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]">
                    阅读该版本正文
                  </summary>
                  <div className="mt-3 max-h-[32rem] overflow-y-auto border-t border-[var(--color-line)] pt-4">
                    <Markdown>{version.bodyMarkdown}</Markdown>
                  </div>
                </details>
              </div>

              {diff && stats && stats.added + stats.removed > 0 && (
                <details className="border-t border-[var(--color-line)]">
                  <summary className="px-4 py-2 text-[0.72rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
                    展开与上一版的差异
                  </summary>
                  <div className="max-h-[28rem] overflow-auto border-t border-[var(--color-line)] font-mono text-[0.7rem] leading-relaxed">
                    {diff.slice(0, 2000).map((line, lineIndex) => (
                      <div
                        key={lineIndex}
                        className={
                          line.type === "add"
                            ? "bg-[#eaf3ec] text-[#24523a]"
                            : line.type === "del"
                              ? "bg-[#f9eae5] text-[#7a2a1b]"
                              : "text-[var(--color-ink-soft)]"
                        }
                      >
                        <span className="inline-block w-10 select-none border-r border-[var(--color-line)] px-1.5 text-right text-[var(--color-ink-faint)]">
                          {line.oldLine ?? ""}
                        </span>
                        <span className="inline-block w-10 select-none border-r border-[var(--color-line)] px-1.5 text-right text-[var(--color-ink-faint)]">
                          {line.newLine ?? ""}
                        </span>
                        <span className="whitespace-pre-wrap px-2">
                          {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                          {line.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
