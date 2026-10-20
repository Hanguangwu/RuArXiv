import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] max-w-2xl flex-col justify-center py-20">
      <p className="label">404 · 未找到</p>
      <h1 className="mt-3 font-serif text-3xl font-semibold">这篇论文不在这里</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        可能是论文尚未通过审核、已被下架，或者链接中的 paperId 有误。
        站内索引与 GitHub 内容源同步存在最长约 10 分钟的延迟，也可以稍后再试。
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary btn-sm">
          返回论文列表
        </Link>
        <Link href="/search" className="btn btn-outline btn-sm">
          搜索论文
        </Link>
        <Link href="/categories" className="btn btn-quiet btn-sm">
          浏览分类
        </Link>
      </div>
    </div>
  );
}
