import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { searchEverything, type SearchHit } from "@/lib/queries";
import { EmptyState } from "@/components/empty-state";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "搜索" };

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="bg-[#f2ddc9] px-0.5 text-[var(--color-ink)]">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function ResultRow({ hit, query }: { hit: SearchHit; query: string }) {
  return (
    <li className="border-b border-[var(--color-line)] py-4">
      <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-[var(--color-ink-faint)]">
        <span className="chip chip-accent">{hit.kind === "paper" ? "论文" : "评论"}</span>
        {hit.matchedIn.map((field) => (
          <span key={field} className="chip">
            {field}命中
          </span>
        ))}
        {hit.author && <span>{hit.author}</span>}
        <span className="ml-auto">{timeAgo(hit.publishedAt)}</span>
      </div>
      <Link
        href={`/papers/${hit.paperId}${hit.kind === "comment" ? "#discussion" : ""}`}
        className="mt-1.5 block font-serif text-[1.08rem] font-semibold leading-snug hover:text-[var(--color-accent)]"
      >
        {hit.paperTitle}
      </Link>
      <p className="mt-1.5 text-[0.83rem] leading-relaxed text-[var(--color-ink-soft)]">
        <Highlight text={hit.snippet} query={query} />
      </p>
      <p className="mt-1.5 text-[0.68rem] text-[var(--color-ink-faint)]">
        {hit.score} 分 · {hit.commentCount} 条讨论
      </p>
    </li>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query ? await searchEverything(query) : { papers: [], comments: [], total: 0 };

  return (
    <div className="container-page py-8">
      <header className="border-b border-[var(--color-line)] pb-6">
        <p className="label">全文检索</p>
        <h1 className="mt-2 font-serif text-[1.9rem] font-semibold">搜索论文与讨论</h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed text-[var(--color-ink-soft)]">
          检索标题、摘要、作者、关键词、分类、Markdown 正文与评论快照。评论命中会单独标注，避免与论文正文混淆。
        </p>

        <form action="/search" role="search" className="mt-5 flex max-w-2xl gap-2">
          <label className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="例如：检索增强、KV 缓存、因果推断"
              className="field h-11 pl-9"
              aria-label="搜索关键词"
            />
          </label>
          <button type="submit" className="btn btn-primary px-4">
            搜索
          </button>
        </form>

        {query && (
          <p className="mt-3 text-[0.75rem] text-[var(--color-ink-faint)]">
            “{query}” 共 {results.total} 个结果 · 论文 {results.papers.length} · 评论{" "}
            {results.comments.length}
          </p>
        )}
      </header>

      {!query ? (
        <div className="mt-8">
          <EmptyState
            title="输入关键词开始检索"
            description="可以搜索论文标题、作者、关键词、分类、正文或评论区内容。支持中英文子串匹配。"
            action={{ href: "/", label: "浏览最新论文" }}
          />
        </div>
      ) : results.total === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="没有找到匹配内容"
            description="尝试缩短关键词、换用同义词，或按分类浏览。检索索引只包含已发布论文与可见评论。"
            action={{ href: "/categories", label: "按分类浏览" }}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
          <div>
            <section>
              <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.15rem] font-semibold">
                论文命中
                <span className="ml-2 text-[0.72rem] font-normal text-[var(--color-ink-faint)]">
                  {results.papers.length}
                </span>
              </h2>
              {results.papers.length === 0 ? (
                <p className="py-6 text-sm text-[var(--color-ink-faint)]">没有论文正文或元数据命中。</p>
              ) : (
                <ul>
                  {results.papers.map((hit) => (
                    <ResultRow key={hit.paperId} hit={hit} query={query} />
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10">
              <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.15rem] font-semibold">
                评论命中
                <span className="ml-2 text-[0.72rem] font-normal text-[var(--color-ink-faint)]">
                  {results.comments.length}
                </span>
              </h2>
              {results.comments.length === 0 ? (
                <p className="py-6 text-sm text-[var(--color-ink-faint)]">评论区没有命中。</p>
              ) : (
                <ul>
                  {results.comments.map((hit, index) => (
                    <ResultRow key={`${hit.paperId}-comment-${index}`} hit={hit} query={query} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-4 text-[0.75rem]">
            <div className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
              <h2 className="font-serif text-[1rem] font-semibold">检索说明</h2>
              <ul className="mt-2.5 space-y-2 leading-relaxed text-[var(--color-ink-soft)]">
                <li>索引为最终一致，页面不实时请求 GitHub。</li>
                <li>正文命中来自当前版本的 Markdown 快照。</li>
                <li>评论命中只包含可见评论。</li>
                <li>中文按子串匹配；生产环境可切换 PostgreSQL FTS / OpenSearch。</li>
              </ul>
            </div>
            <div className="border border-[var(--color-line)] p-4">
              <p className="label">提示</p>
              <p className="mt-2 leading-relaxed text-[var(--color-ink-soft)]">
                可以用作者姓名、分类代码（如 <span className="mono">cs.CL</span>）或 commit 中的关键词检索。
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
