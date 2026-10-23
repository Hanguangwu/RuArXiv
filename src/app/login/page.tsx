import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GitBranch, ShieldCheck } from "lucide-react";
import { demoLoginEnabled, githubConfigured } from "@/lib/auth";
import { loginDemoAction } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录" };

const ERRORS: Record<string, string> = {
  github_not_configured: "尚未配置 GitHub OAuth，请联系管理员。",
  demo_disabled: "演示登录已关闭，请使用 GitHub 登录。",
  invite_required: "该 GitHub 账号不在邀请名单中。RuArXiv 采用邀请制，请联系管理员。",
  suspended: "该账号已被暂停，请联系管理员。",
  invalid_state: "登录状态校验失败，请重新发起登录。",
  oauth_failed: "GitHub 授权失败，请稍后重试。",
  forbidden: "当前账号没有访问该页面的权限。",
};

const PERSONAS = [
  {
    kind: "reader",
    title: "读者",
    login: "wangzhe",
    description: "浏览、搜索、投票、举报。评论需要邀请权限。",
  },
  {
    kind: "author",
    title: "作者",
    login: "linxiaoyu",
    description: "提交论文、参与讨论、查看自己的审核状态。",
  },
  {
    kind: "admin",
    title: "管理员",
    login: "admin",
    description: "审核队列、举报处理、同步事件与审计日志。",
  },
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;
  const configured = githubConfigured();
  const demoEnabled = demoLoginEnabled();
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <div className="container-page py-10">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
        <section className="max-w-xl">
          <p className="label">身份</p>
          <h1 className="mt-2 font-serif text-[2.2rem] font-semibold leading-tight">
            GitHub 身份，站内权限
          </h1>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-[var(--color-ink-soft)]">
            RuArXiv 使用 GitHub 登录确认你是谁，但发帖、审核与投票权限由站内角色决定。
            GitHub 身份不等于编辑权，也不等于可以修改他人论文。
          </p>

          <ul className="mt-7 space-y-4 text-[0.84rem]">
            <li className="flex gap-3 border-b border-[var(--color-line)] pb-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-moss)]" aria-hidden />
              <div>
                <p className="font-medium">只申请最小权限</p>
                <p className="mt-0.5 leading-relaxed text-[var(--color-ink-soft)]">
                  登录只读取公开身份与已验证邮箱；不在浏览器保存 GitHub token。
                </p>
              </div>
            </li>
            <li className="flex gap-3 border-b border-[var(--color-line)] pb-4">
              <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-soft)]" aria-hidden />
              <div>
                <p className="font-medium">不可变身份关联</p>
                <p className="mt-0.5 leading-relaxed text-[var(--color-ink-soft)]">
                  账号以 GitHub user ID 关联，用户名变更不会丢失作者身份与历史。
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden />
              <div>
                <p className="font-medium">邀请制社区</p>
                <p className="mt-0.5 leading-relaxed text-[var(--color-ink-soft)]">
                  新账号需要邀请码或邀请邮箱；第一位登录用户会自动成为管理员。
                </p>
              </div>
            </li>
          </ul>

          <div className="mt-8 border-l-2 border-[var(--color-accent)] pl-4 font-serif text-[0.95rem] italic leading-relaxed text-[var(--color-ink-soft)]">
            “把论证留在正文，把质疑留在讨论，把修改留在 commit。”
          </div>
        </section>

        <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)]">
          <div className="border-b border-[var(--color-line)] px-5 py-4">
            <h2 className="font-serif text-lg font-semibold">登录</h2>
            <p className="mt-0.5 text-[0.72rem] text-[var(--color-ink-faint)]">
              登录后返回：<span className="mono">{safeNext}</span>
            </p>
          </div>

          <div className="space-y-4 p-5">
            {error && (
              <div className="banner banner-error text-[0.78rem]">
                {ERRORS[error] ?? decodeURIComponent(error)}
              </div>
            )}

            {configured ? (
              <a
                href={`/api/v1/auth/github/start?next=${encodeURIComponent(safeNext)}`}
                className="btn btn-primary w-full"
              >
                <GitBranch className="h-4 w-4" aria-hidden />
                使用 GitHub 登录
              </a>
            ) : (
              <div>
                <button type="button" className="btn btn-primary w-full" disabled>
                  <GitBranch className="h-4 w-4" aria-hidden />
                  使用 GitHub 登录
                </button>
                <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--color-ink-faint)]">
                  未检测到 <span className="mono">GITHUB_CLIENT_ID</span>。配置后此按钮会自动启用；
                  请联系管理员。
                </p>
              </div>
            )}

            {demoEnabled && (
              <>
                <div className="flex items-center gap-3 text-[0.64rem] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  <span className="h-px flex-1 bg-[var(--color-line)]" />
                  演示模式
                  <span className="h-px flex-1 bg-[var(--color-line)]" />
                </div>

                <div className="space-y-2">
                  {PERSONAS.map((persona) => (
                    <form key={persona.kind} action={loginDemoAction}>
                      <input type="hidden" name="kind" value={persona.kind} />
                      <input type="hidden" name="next" value={safeNext} />
                      <button
                        type="submit"
                        className="group flex w-full items-center justify-between gap-3 border border-[var(--color-line)] px-3 py-2.5 text-left transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-paper)]"
                      >
                        <span>
                          <span className="block text-[0.8rem] font-medium">
                            {persona.title}
                            <span className="ml-2 font-mono text-[0.65rem] font-normal text-[var(--color-ink-faint)]">
                              @{persona.login}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-[var(--color-ink-faint)]">
                            {persona.description}
                          </span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-ink-faint)] group-hover:text-[var(--color-accent)]" aria-hidden />
                      </button>
                    </form>
                  ))}
                </div>

                <p className="text-[0.66rem] leading-relaxed text-[var(--color-ink-faint)]">
                  演示账号是本地账号，不经过 GitHub。它们仅用于展示权限差异与审核流程，不会写入真实仓库。
                  生产环境请保持 <span className="mono">ALLOW_DEMO_LOGIN=false</span>。
                </p>
              </>
            )}
          </div>

          <div className="border-t border-[var(--color-line)] px-5 py-3 text-[0.68rem] text-[var(--color-ink-faint)]">
            继续即表示同意社区规则与内容许可要求。
            <Link href="/" className="ml-1 underline hover:text-[var(--color-accent)]">
              先随便看看
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
