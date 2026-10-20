import Link from "next/link";
import { SORT_OPTIONS, type SortKey } from "@/lib/constants";

export function SortTabs({
  active,
  basePath,
  params = {},
}: {
  active: SortKey;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const buildHref = (sort: SortKey) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (sort !== "latest") search.set("sort", sort);
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <nav className="tabs" aria-label="排序方式">
      {(Object.keys(SORT_OPTIONS) as SortKey[]).map((sort) => (
        <Link
          key={sort}
          href={buildHref(sort)}
          className="tab"
          data-active={sort === active}
          aria-current={sort === active ? "page" : undefined}
        >
          {SORT_OPTIONS[sort]}
        </Link>
      ))}
    </nav>
  );
}
