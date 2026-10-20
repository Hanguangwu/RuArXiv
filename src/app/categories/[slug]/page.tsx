import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CATEGORY_MAP } from "@/lib/constants";
import { isSortKey, type SortKey } from "@/lib/constants";
import { listPapers } from "@/lib/queries";
import { PaperRow } from "@/components/paper-row";
import { SortTabs } from "@/components/sort-tabs";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORY_MAP.get(slug);
  return { title: category ? `${categoryName(category)} (${slug})` : slug };
}

function categoryName(category: { name: string; slug: string }) {
  return `${category.name}`;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; cursor?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = CATEGORY_MAP.get(slug);
  if (!category) notFound();

  const sort: SortKey = isSortKey(query.sort) ? query.sort : "latest";
  const feed = await listPapers({ category: slug, sort, cursor: query.cursor, limit: 12 });

  const nextParams = new URLSearchParams();
  if (sort !== "latest") nextParams.set("sort", sort);
  if (feed.nextCursor) nextParams.set("cursor", feed.nextCursor);

  return (
    <div className="container-page py-8">
      <Link href="/categories" className="inline-flex items-center gap-1 text-[0.75rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
        <ArrowLeft className="h-3 w-3" aria-hidden />
        全部分类
      </Link>

      <header className="mt-4 border-b border-[var(--color-line)] pb-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="chip chip-mono chip-accent">{category.slug}</span>
          <h1 className="font-serif text-[1.9rem] font-semibold">{category.name}</h1>
        </div>
        <p className="mt-2 max-w-2xl text-[0.86rem] leading-relaxed text-[var(--color-ink-soft)]">
          {category.description}。当前共有 <span className="tabular">{feed.total}</span> 篇已发布论文。
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)]">
        <SortTabs active={sort} basePath={`/categories/${slug}`} />
        <span className="text-[0.7rem] text-[var(--color-ink-faint)]">共 {feed.total} 篇</span>
      </div>

      {feed.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="这个分类还没有论文"
            description="可以切换到其他分类，或者提交这个方向的第一篇论文。"
            action={{ href: "/submit", label: "提交论文" }}
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
          <Link href={`/categories/${slug}?${nextParams.toString()}`} className="btn btn-outline" prefetch={false}>
            下一页
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
