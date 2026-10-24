import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { PaperRow } from "@/components/paper-row";
import { SortTabs } from "@/components/sort-tabs";
import { EmptyState } from "@/components/empty-state";
import { getCategoriesWithCounts, getStats, getTopAuthors, listPapers } from "@/lib/queries";
import { isSortKey, type SortKey } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = { sort?: string; cursor?: string; category?: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sort: SortKey = isSortKey(params.sort) ? params.sort : "latest";

  const [feed, stats, categories, authors] = await Promise.all([
    listPapers({ limit: 10, sort, cursor: params.cursor, category: params.category }),
    getStats(),
    getCategoriesWithCounts(),
    getTopAuthors(5),
  ]);

  const nextParams = new URLSearchParams();
  if (sort !== "latest") nextParams.set("sort", sort);
  if (params.category) nextParams.set("category", params.category);
  if (feed.nextCursor) nextParams.set("cursor", feed.nextCursor);

  const activeCategories = categories.filter((category) => category.count > 0);

  return (
    <div>
      <section className="border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]/60">
        <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end lg:py-14">
          <div>
            <p className="label mb-3">GitHub-backed · 邀请制学术社区</p>
            <h1 className="max-w-2xl font-serif text-[2.1rem] font-semibold leading-[1.18] tracking-tight sm:text-[2.7rem]">
              把论文放回讨论里。
            </h1>
            <p className="mt-4 max-w-xl text-[0.92rem] leading-relaxed text-[var(--color-ink-soft)]">
              论文以 Markdown 存放在 GitHub 仓库，讨论使用 Issue，修改历史以 commit 为单位保留。
              这里不生产不可追溯的内容，只把学术讨论应有的证据链摆到台面上。
            </p>

            <form action="/search" role="search" className="mt-6 flex max-w-xl gap-2">
              <label className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]"
                  aria-hidden
                />
                <input
                  type="search"
                  name="q"
                  placeholder="搜索标题、作者、摘要、正文或评论…"
                  aria-label="搜索论文"
                  className="field search-field h-11"
                />
              </label>
              <button type="submit" className="btn btn-primary px-4">
                搜索
              </button>
            </form>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--color-line)] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div>
              <dt className="text-[0.68rem] text-[var(--color-ink-faint)]">公开论文</dt>
              <dd className="stat-number mt-1">{stats.papers}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] text-[var(--color-ink-faint)]">讨论</dt>
              <dd className="stat-number mt-1">{stats.comments}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] text-[var(--color-ink-faint)]">版本快照</dt>
              <dd className="stat-number mt-1">{stats.versions}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] text-[var(--color-ink-faint)]">最后同步</dt>
              <dd className="mt-1.5 font-mono text-[0.78rem] text-[var(--color-ink-soft)]">
                {stats.lastSyncAt ? formatDate(stats.lastSyncAt) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="container-page grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)]">
            <SortTabs
              active={sort}
              basePath="/"
              params={{ category: params.category }}
            />
            <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
              共 {feed.total} 篇
            </span>
          </div>

          {feed.items.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="这个筛选下还没有论文"
                description="换一个分类或排序方式，也可以从一篇待审核的论文开始了解内容规范。"
                action={{ href: "/categories", label: "浏览全部分类" }}
              />
            </div>
          ) : (
            <div>
              {feed.items.map((paper, index) => (
                <PaperRow key={paper.id} paper={paper} index={index} />
              ))}
            </div>
          )}

          {feed.nextCursor && (
            <div className="mt-6 flex justify-center">
              <Link
                href={`/?${nextParams.toString()}`}
                className="btn btn-outline"
                prefetch={false}
              >
                下一页
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.05rem] font-semibold">分类</h2>
              <Link href="/categories" className="text-[0.7rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
                全部
              </Link>
            </div>
            <ul className="mt-2">
              {activeCategories.slice(0, 9).map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)]/60 py-2 text-[0.82rem] text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
                  >
                    <span>
                      <span className="mono text-[0.72rem] text-[var(--color-ink-faint)]">{category.slug}</span>{" "}
                      {category.name}
                    </span>
                    <span className="tabular text-[0.7rem] text-[var(--color-ink-faint)]">{category.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.05rem] font-semibold">活跃作者</h2>
              <Link href="/rankings" className="text-[0.7rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
                排行
              </Link>
            </div>
            <ul className="mt-3 space-y-2.5">
              {authors.map((author) => (
                <li key={author.login}>
                  <Link
                    href={`/authors/${author.login}`}
                    className="flex items-center gap-2.5 text-[0.8rem] hover:text-[var(--color-accent)]"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper-sunk)] text-[0.62rem] font-medium">
                      {author.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{author.name}</span>
                    <span className="tabular text-[0.68rem] text-[var(--color-ink-faint)]">{author.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
            <h2 className="font-serif text-[1rem] font-semibold">运作方式</h2>
            <ol className="mt-3 space-y-3 text-[0.75rem] leading-relaxed text-[var(--color-ink-soft)]">
              <li className="flex gap-2">
                <span className="mono shrink-0 text-[0.68rem] text-[var(--color-accent)]">01</span>
                论文与元数据提交到 GitHub 仓库，CI 校验后合并。
              </li>
              <li className="flex gap-2">
                <span className="mono shrink-0 text-[0.68rem] text-[var(--color-accent)]">02</span>
                每篇论文对应一个 Issue，评论与 reaction 保留原始出处。
              </li>
              <li className="flex gap-2">
                <span className="mono shrink-0 text-[0.68rem] text-[var(--color-accent)]">03</span>
                Webhook 与定时对账把内容写入站内索引，页面不直连 GitHub。
              </li>
            </ol>
            <Link href="/submit" className="btn btn-outline btn-sm mt-4 w-full">
              提交一篇论文
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
