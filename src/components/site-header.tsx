import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { hasRole, ROLE_LABELS, isRole } from "@/lib/constants";
import { Avatar } from "./avatar";
import { Search } from "lucide-react";

const NAV = [
  { href: "/", label: "论文" },
  { href: "/categories", label: "分类" },
  { href: "/rankings", label: "排行榜" },
  { href: "/submit", label: "提交论文" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 backdrop-blur-sm">
      <div className="hidden border-b border-[var(--color-line)] sm:block">
        <div className="container-page flex h-7 items-center justify-between text-[0.68rem] text-[var(--color-ink-faint)]">
          <span>GitHub 是内容源：论文、评论与修改历史均可追溯到 commit 与 Issue</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-moss)]" />
            邀请制社区
          </span>
        </div>
      </div>

      <div className="container-page flex h-14 items-center gap-3 sm:gap-5">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="RuArXiv 首页">
          <span className="font-serif text-[1.35rem] font-semibold leading-none tracking-tight">
            Ru<span className="text-[var(--color-accent)]">Ar</span>Xiv
          </span>
          <span className="hidden text-[0.6rem] font-medium uppercase tracking-[0.16em] text-[var(--color-ink-faint)] sm:inline">
            papers
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-[0.83rem] text-[var(--color-ink-soft)]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded px-2 py-1.5 hover:bg-[var(--color-paper-sunk)] hover:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form
          action="/search"
          className="ml-auto hidden min-w-0 flex-1 items-center justify-end md:flex lg:max-w-xs"
          role="search"
        >
          <label className="relative flex w-full">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="搜索标题、摘要、正文或评论"
              aria-label="搜索论文"
              className="field h-9 w-full pl-8 text-[0.8rem]"
            />
          </label>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          {user ? (
            <>
              {hasRole(user.role, "MODERATOR") && (
                <Link
                  href="/admin"
                  className="hidden rounded px-2 py-1.5 text-[0.8rem] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-sunk)] sm:inline"
                >
                  管理台
                </Link>
              )}
              <Link
                href={`/authors/${user.login}`}
                className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[var(--color-paper-sunk)]"
                title={`${user.name ?? user.login} · ${isRole(user.role) ? ROLE_LABELS[user.role] : user.role}`}
              >
                <Avatar src={user.avatarUrl} name={user.name ?? user.login} size={26} />
                <span className="hidden text-[0.8rem] font-medium lg:inline">
                  {user.name ?? user.login}
                </span>
              </Link>
              <form action="/api/v1/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded px-2 py-1.5 text-[0.78rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn btn-outline btn-sm">
              使用 GitHub 登录
            </Link>
          )}
        </div>
      </div>

      <div className="container-page pb-2 md:hidden">
        <form action="/search" role="search" className="flex">
          <label className="relative flex w-full">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="搜索论文、正文或评论"
              aria-label="搜索论文"
              className="field h-9 w-full pl-8 text-[0.8rem]"
            />
          </label>
        </form>
      </div>
    </header>
  );
}
