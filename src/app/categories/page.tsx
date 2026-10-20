import type { Metadata } from "next";
import Link from "next/link";
import { getCategoriesWithCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "分类" };

export default async function CategoriesPage() {
  const categories = await getCategoriesWithCounts();
  const groups = new Map<string, typeof categories>();
  for (const category of categories) {
    const bucket = groups.get(category.group) ?? [];
    bucket.push(category);
    groups.set(category.group, bucket);
  }

  return (
    <div className="container-page py-8">
      <header className="max-w-3xl border-b border-[var(--color-line)] pb-6">
        <p className="label">主题</p>
        <h1 className="mt-2 font-serif text-[2rem] font-semibold">按分类浏览</h1>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
          分类来自论文元数据中的 <span className="mono text-[0.8rem]">categories</span> 字段，采用 arXiv 风格的代码。
          一篇论文可以属于多个分类，计数按论文去重。
        </p>
      </header>

      <div className="mt-8 space-y-10">
        {Array.from(groups.entries()).map(([group, items]) => (
          <section key={group}>
            <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.15rem] font-semibold">
              {group}
              <span className="ml-2 text-[0.72rem] font-normal text-[var(--color-ink-faint)]">
                {items.length} 个分类
              </span>
            </h2>
            <ul className="mt-1">
              {items.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--color-line)] py-3 hover:bg-[var(--color-paper-raised)]"
                  >
                    <span className="mono w-32 shrink-0 text-[0.75rem] text-[var(--color-accent)]">
                      {category.slug}
                    </span>
                    <span className="font-serif text-[1.02rem] font-medium group-hover:text-[var(--color-accent)]">
                      {category.name}
                    </span>
                    <span className="min-w-0 flex-1 text-[0.78rem] text-[var(--color-ink-faint)]">
                      {category.description}
                    </span>
                    <span className="tabular text-[0.72rem] text-[var(--color-ink-faint)]">
                      {category.count} 篇
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
