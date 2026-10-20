import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboards } from "@/lib/queries";
import { categoryName, ROLE_LABELS, isRole } from "@/lib/constants";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "排行榜" };

export default async function RankingsPage() {
  const { topPapers, mostDiscussed, topAuthors, recent } = await getLeaderboards();

  return (
    <div className="container-page py-8">
      <header className="max-w-2xl border-b border-[var(--color-line)] pb-5">
        <p className="label">社区</p>
        <h1 className="mt-2 font-serif text-[2rem] font-semibold">排行榜</h1>
        <p className="mt-2 text-[0.86rem] leading-relaxed text-[var(--color-ink-soft)]">
          评分来自站内投票与 GitHub reactions 的聚合；讨论数来自 Issue 评论快照。
          排行榜只统计已发布论文，并按最后同步时间更新。
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
            <h2 className="font-serif text-[1.2rem] font-semibold">最高评分</h2>
            <span className="text-[0.68rem] text-[var(--color-ink-faint)]">按 score</span>
          </div>
          <ol className="mt-1">
            {topPapers.map((paper, index) => (
              <li key={paper.id} className="flex gap-3 border-b border-[var(--color-line)] py-3">
                <span className="w-5 shrink-0 pt-0.5 text-right font-serif text-[0.95rem] text-[var(--color-ink-faint)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/papers/${paper.id}`}
                    className="font-serif text-[0.98rem] font-medium leading-snug hover:text-[var(--color-accent)]"
                  >
                    {paper.title}
                  </Link>
                  <p className="mt-0.5 truncate text-[0.7rem] text-[var(--color-ink-faint)]">
                    {paper.authors.map((author) => author.name).join("、")} ·{" "}
                    {paper.categories.map(categoryName).join(" / ")}
                  </p>
                </div>
                <span className="shrink-0 self-center tabular text-[0.85rem] font-semibold">{paper.score}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
            <h2 className="font-serif text-[1.2rem] font-semibold">讨论最多</h2>
            <span className="text-[0.68rem] text-[var(--color-ink-faint)]">按评论数</span>
          </div>
          <ol className="mt-1">
            {mostDiscussed.map((paper, index) => (
              <li key={paper.id} className="flex gap-3 border-b border-[var(--color-line)] py-3">
                <span className="w-5 shrink-0 pt-0.5 text-right font-serif text-[0.95rem] text-[var(--color-ink-faint)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/papers/${paper.id}#discussion`}
                    className="font-serif text-[0.98rem] font-medium leading-snug hover:text-[var(--color-accent)]"
                  >
                    {paper.title}
                  </Link>
                  <p className="mt-0.5 truncate text-[0.7rem] text-[var(--color-ink-faint)]">
                    {paper.authors.map((author) => author.name).join("、")}
                  </p>
                </div>
                <span className="shrink-0 self-center tabular text-[0.85rem] font-semibold">
                  {paper.commentCount}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
          <h2 className="font-serif text-[1.2rem] font-semibold">作者榜</h2>
          <span className="text-[0.68rem] text-[var(--color-ink-faint)]">按论文总评分</span>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full min-w-[36rem] border-collapse text-[0.8rem]">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[0.65rem] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">作者</th>
                <th className="py-2 pr-3 font-medium">单位</th>
                <th className="py-2 pr-3 font-medium">方向</th>
                <th className="py-2 pr-3 text-right font-medium">论文</th>
                <th className="py-2 text-right font-medium">评分</th>
              </tr>
            </thead>
            <tbody>
              {topAuthors.map((author, index) => (
                <tr key={author.login} className="border-b border-[var(--color-line)]">
                  <td className="py-2.5 pr-3 tabular text-[var(--color-ink-faint)]">{index + 1}</td>
                  <td className="py-2.5 pr-3">
                    <Link href={`/authors/${author.login}`} className="flex items-center gap-2 hover:text-[var(--color-accent)]">
                      <Avatar src={author.avatarUrl} name={author.name} size={24} />
                      <span>
                        <span className="block font-medium">{author.name}</span>
                        <span className="block text-[0.65rem] text-[var(--color-ink-faint)]">@{author.login}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--color-ink-soft)]">{author.affiliation ?? "—"}</td>
                  <td className="py-2.5 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {author.categories.slice(0, 2).map((category) => (
                        <Link key={category} href={`/categories/${category}`} className="chip">
                          {category}
                        </Link>
                      ))}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular">{author.paperCount}</td>
                  <td className="py-2.5 text-right tabular font-semibold">{author.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
          <h2 className="font-serif text-[1.2rem] font-semibold">最近发布</h2>
          <Link href="/" className="text-[0.7rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
            查看全部
          </Link>
        </div>
        <ul className="mt-1 grid gap-x-8 sm:grid-cols-2">
          {recent.map((paper) => (
            <li key={paper.id} className="border-b border-[var(--color-line)] py-3">
              <Link href={`/papers/${paper.id}`} className="font-serif text-[0.95rem] font-medium hover:text-[var(--color-accent)]">
                {paper.title}
              </Link>
              <p className="mt-0.5 text-[0.68rem] text-[var(--color-ink-faint)]">
                {paper.authors.map((author) => author.name).join("、")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
