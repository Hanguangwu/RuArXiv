import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { createPaperAction } from "@/app/actions";
import { PaperFields } from "@/components/paper-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "提交论文" };

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, viewer] = await Promise.all([searchParams, getCurrentUser()]);
  const canSubmit = !!viewer && hasRole(viewer.role, "AUTHOR");

  return (
    <div className="container-page py-8">
      <header className="max-w-3xl border-b border-[var(--color-line)] pb-5">
        <p className="label">投稿</p>
        <h1 className="mt-2 font-serif text-[2rem] font-semibold">提交论文</h1>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
          论文以 Markdown 正文 + YAML 元数据进入内容仓库。网站会生成不可变的 paperId 与目录，
          配置 GitHub 后会提交到统一投稿分支，并自动创建/合并 PR；合并后由 Webhook 同步并进入审核队列。
        </p>
      </header>

      {error && <div className="banner banner-error mt-5">{error}</div>}

      {!viewer ? (
        <div className="mt-8 max-w-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-6">
          <h2 className="font-serif text-lg font-semibold">需要先登录</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            提交论文需要 GitHub 身份与作者权限。登录后如果仍无权限，请联系管理员升级角色。
          </p>
          <Link href="/login?next=/submit" className="btn btn-primary btn-sm mt-5">
            使用 GitHub 登录
          </Link>
        </div>
      ) : !canSubmit ? (
        <div className="mt-8 max-w-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-6">
          <h2 className="font-serif text-lg font-semibold">当前账号还没有作者权限</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            @{viewer.login} 目前是 <span className="mono">{viewer.role}</span>。RuArXiv 采用邀请制，
            作者权限由管理员授予。你仍然可以浏览、投票和参与讨论。
          </p>
          <div className="mt-5 flex gap-2">
            <Link href="/" className="btn btn-outline btn-sm">
              返回论文列表
            </Link>
            <Link href="/login" className="btn btn-quiet btn-sm">
              切换账号
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <form action={createPaperAction} className="space-y-5">
            <PaperFields />

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-line)] pt-4">
              <button type="submit" className="btn btn-primary">
                提交并进入审核
              </button>
              <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
                提交后状态为 PENDING_REVIEW，管理员批准后公开。
              </span>
            </div>
          </form>

          <aside className="space-y-5 text-[0.78rem]">
            <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
              <h2 className="font-serif text-[1rem] font-semibold">发布流程</h2>
              <ol className="mt-3 space-y-2.5 leading-relaxed text-[var(--color-ink-soft)]">
                <li><span className="mono mr-1 text-[var(--color-accent)]">01</span>网站生成 paperId 与目录，写入内容仓库。</li>
                <li><span className="mono mr-1 text-[var(--color-accent)]">02</span>提交到统一投稿分支，自动创建并合并 PR。</li>
                <li><span className="mono mr-1 text-[var(--color-accent)]">03</span>CI 校验 Schema、目录命名、链接与脚本。</li>
                <li><span className="mono mr-1 text-[var(--color-accent)]">04</span>合并后 Webhook 同步，管理员审核发布。</li>
              </ol>
            </section>

            <section className="border border-[var(--color-line)] p-4">
              <h2 className="font-serif text-[1rem] font-semibold">写作要求</h2>
              <ul className="mt-2.5 space-y-2 leading-relaxed text-[var(--color-ink-soft)]">
                <li>正文至少 200 字，包含摘要、方法、实验与限制。</li>
                <li>只提交你有权传播的内容，并选择明确许可。</li>
                <li>引用与数据来源要可核查；不确定的结论明确标注。</li>
                <li>PDF 与图片建议放对象存储，Git 仓库只保留 Markdown。</li>
              </ul>
            </section>

            <section className="border border-[var(--color-line)] p-4">
              <p className="label">审核说明</p>
              <p className="mt-2 leading-relaxed text-[var(--color-ink-soft)]">
                审核关注版权、格式与基本可读性，不评价学术观点。被驳回会保留 commit 与审计记录，可以修改后重新提交。
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
