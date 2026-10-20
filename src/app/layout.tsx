import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "RuArXiv · 基于 GitHub 的论文论坛",
    template: "%s · RuArXiv",
  },
  description:
    "以 GitHub 为内容与审计源的开放论文论坛：Markdown 论文、Issue 讨论、可追溯的版本历史。",
  openGraph: {
    title: "RuArXiv",
    description: "论文、版本与讨论都可追溯到 GitHub 的学术论坛。",
    type: "website",
  },
};

const FOOTER_LINKS = [
  {
    title: "浏览",
    links: [
      { href: "/", label: "最新论文" },
      { href: "/categories", label: "分类" },
      { href: "/rankings", label: "排行榜" },
      { href: "/search", label: "搜索" },
    ],
  },
  {
    title: "参与",
    links: [
      { href: "/submit", label: "提交论文" },
      { href: "/login", label: "登录 / 邀请" },
      { href: "/admin", label: "审核台" },
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--color-ink)] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          跳到正文
        </a>
        <SiteHeader />
        <main id="main">{children}</main>

        <footer className="mt-20 border-t border-[var(--color-line)] bg-[var(--color-paper)]">
          <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-serif text-lg font-semibold">
                Ru<span className="text-[var(--color-accent)]">Ar</span>Xiv
              </p>
              <p className="mt-2 max-w-xs text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
                论文正文存放在 GitHub 仓库，讨论使用 Issue，网站维护只读索引。每一次修改都有 commit，每一条意见都能回到原始出处。
              </p>
            </div>
            {FOOTER_LINKS.map((group) => (
              <div key={group.title}>
                <p className="label">{group.title}</p>
                <ul className="mt-3 space-y-2 text-[0.8rem] text-[var(--color-ink-soft)]">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="hover:text-[var(--color-accent)]">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="label">内容源</p>
              <ul className="mt-3 space-y-2 text-[0.8rem] text-[var(--color-ink-soft)]">
                <li>Markdown 论文 + YAML 元数据</li>
                <li>GitHub Issue 讨论与 reaction</li>
                <li>Webhook + 定时对账同步</li>
                <li>索引最终一致，页面显示同步时间</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--color-line)]">
            <div className="container-page flex flex-wrap items-center justify-between gap-2 py-4 text-[0.68rem] text-[var(--color-ink-faint)]">
              <span>RuArXiv · 演示项目 · 内容为虚构文本</span>
              <span>设计文档 v1.0 · Next.js + Prisma</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
