import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAdminOverview } from "@/lib/queries";
import { PAPER_STATUS_LABELS, ROLE_LABELS, isRole } from "@/lib/constants";
import { formatDateTime, timeAgo } from "@/lib/format";
import { moderatePaperAction, resolveReportAction, syncNowAction } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "管理后台" };

const SYNC_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  PROCESSED: "已处理",
  FAILED: "失败",
  DUPLICATE: "重复投递",
};

function Notice({ params }: { params: { ok?: string; synced?: string; error?: string } }) {
  if (params.error) {
    const messages: Record<string, string> = {
      forbidden: "当前账号没有管理权限。",
      unknown_action: "无法识别的审核动作。",
      not_found: "论文不存在，可能已被删除。",
    };
    return <p className="banner banner-error">{messages[params.error] ?? `操作失败：${params.error}`}</p>;
  }
  if (params.synced !== undefined) {
    return <p className="banner banner-ok">本地内容同步完成，新增或更新 {params.synced} 篇论文。</p>;
  }
  if (params.ok) {
    return <p className="banner banner-ok">操作已记录，页面数据已刷新。</p>;
  }
  return null;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; synced?: string; error?: string }>;
}) {
  const user = await requireUser("MODERATOR");
  const params = await searchParams;
  const overview = await getAdminOverview();
  const { pending, reports, syncEvents, auditLogs, hiddenCount, paperCount, userCount } = overview;

  return (
    <div className="container-page py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] pb-5">
        <div>
          <p className="label">运营</p>
          <h1 className="mt-2 font-serif text-[2rem] font-semibold">管理后台</h1>
          <p className="mt-2 max-w-2xl text-[0.86rem] leading-relaxed text-[var(--color-ink-soft)]">
            审核提交、处理举报、查看同步事件与操作审计。所有审核动作都会写入审计日志。
          </p>
        </div>
        <div className="text-right text-[0.75rem] text-[var(--color-ink-faint)]">
          <p className="font-medium text-[var(--color-ink-soft)]">{user.name ?? user.login}</p>
          <p>@{user.login} · {ROLE_LABELS[isRole(user.role) ? user.role : "USER"]}</p>
        </div>
      </header>

      <div className="mt-5">
        <Notice params={params} />
      </div>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "待审核", value: pending.length },
          { label: "待处理举报", value: reports.length },
          { label: "已隐藏/驳回", value: hiddenCount },
          { label: "论文 / 用户", value: `${paperCount} / ${userCount}` },
        ].map((stat) => (
          <div key={stat.label} className="score-panel">
            <p className="label">{stat.label}</p>
            <p className="stat-number mt-1.5">{stat.value}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.2rem] font-semibold">待审核论文</h2>
              <span className="text-[0.68rem] text-[var(--color-ink-faint)]">按提交时间升序</span>
            </div>
            {pending.length === 0 ? (
              <p className="py-6 text-[0.82rem] text-[var(--color-ink-faint)]">审核队列为空。</p>
            ) : (
              <ul>
                {pending.map((paper) => (
                  <li key={paper.id} className="border-b border-[var(--color-line)] py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/papers/${paper.id}`}
                          className="font-serif text-[1.02rem] font-medium leading-snug hover:text-[var(--color-accent)]"
                        >
                          {paper.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
                          {paper.abstract}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-[var(--color-ink-faint)]">
                          <span className="mono">{paper.id}</span>
                          <span>提交者 @{paper.submittedBy?.login ?? "未知"}</span>
                          <span>{timeAgo(paper.createdAt)}</span>
                          <span className="chip chip-accent">{PAPER_STATUS_LABELS.PENDING_REVIEW}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <form action={moderatePaperAction}>
                          <input type="hidden" name="paperId" value={paper.id} />
                          <input type="hidden" name="action" value="approve" />
                          <button type="submit" className="btn btn-primary btn-sm">通过</button>
                        </form>
                        <form action={moderatePaperAction}>
                          <input type="hidden" name="paperId" value={paper.id} />
                          <input type="hidden" name="action" value="reject" />
                          <button type="submit" className="btn btn-outline btn-sm">驳回</button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.2rem] font-semibold">举报队列</h2>
              <span className="text-[0.68rem] text-[var(--color-ink-faint)]">未处理</span>
            </div>
            {reports.length === 0 ? (
              <p className="py-6 text-[0.82rem] text-[var(--color-ink-faint)]">没有待处理举报。</p>
            ) : (
              <ul>
                {reports.map((report) => (
                  <li key={report.id} className="border-b border-[var(--color-line)] py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.86rem] font-medium">
                          {report.reason}
                          <span className="ml-2 text-[0.68rem] font-normal text-[var(--color-ink-faint)]">
                            {report.commentId ? "评论" : "论文"} · @{report.reporter?.login ?? "匿名"}
                          </span>
                        </p>
                        {report.paper ? (
                          <Link
                            href={`/papers/${report.paper.id}${report.commentId ? "#discussion" : ""}`}
                            className="mt-1 block text-[0.78rem] text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
                          >
                            {report.paper.title}
                          </Link>
                        ) : (
                          <p className="mt-1 text-[0.78rem] text-[var(--color-ink-faint)]">
                            关联内容已删除（{report.commentId ?? report.paperId ?? "未知"}）
                          </p>
                        )}
                        {report.detail ? (
                          <p className="mt-1.5 border-l-2 border-[var(--color-line)] pl-2 text-[0.76rem] leading-relaxed text-[var(--color-ink-soft)]">
                            {report.detail}
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-[0.68rem] text-[var(--color-ink-faint)]">
                          {formatDateTime(report.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <form action={resolveReportAction}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="decision" value="resolve" />
                          <input type="hidden" name="resolution" value="举报成立，内容已隐藏" />
                          <button type="submit" className="btn btn-accent btn-sm">成立并隐藏</button>
                        </form>
                        <form action={resolveReportAction}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="decision" value="dismiss" />
                          <input type="hidden" name="resolution" value="举报不成立" />
                          <button type="submit" className="btn btn-outline btn-sm">驳回举报</button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.2rem] font-semibold">审计日志</h2>
              <span className="text-[0.68rem] text-[var(--color-ink-faint)]">最近 15 条</span>
            </div>
            {auditLogs.length === 0 ? (
              <p className="py-6 text-[0.82rem] text-[var(--color-ink-faint)]">暂无记录。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-1 w-full min-w-[30rem] border-collapse text-[0.76rem]">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-left text-[0.63rem] uppercase tracking-wider text-[var(--color-ink-faint)]">
                      <th className="py-2 pr-3 font-medium">时间</th>
                      <th className="py-2 pr-3 font-medium">操作者</th>
                      <th className="py-2 pr-3 font-medium">动作</th>
                      <th className="py-2 font-medium">对象</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-[var(--color-line)] align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-[var(--color-ink-faint)]">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="py-2 pr-3">@{log.actorLogin ?? "system"}</td>
                        <td className="py-2 pr-3 mono text-[0.7rem]">{log.action}</td>
                        <td className="py-2 text-[0.7rem] text-[var(--color-ink-soft)]">
                          {log.targetType}
                          {log.targetId ? <span className="ml-1 text-[var(--color-ink-faint)]">{log.targetId.slice(0, 12)}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          <section className="score-panel">
            <h2 className="font-serif text-[1.05rem] font-semibold">内容同步</h2>
            <p className="mt-1.5 text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
              从本地 content 仓库（或已配置的 GitHub 仓库）重新入库论文、版本与讨论快照。操作幂等，可重复执行。
            </p>
            <form action={syncNowAction} className="mt-3">
              <button type="submit" className="btn btn-primary btn-sm w-full">立即同步</button>
            </form>
            <p className="mt-2 text-[0.66rem] leading-relaxed text-[var(--color-ink-faint)]">
              生产环境请通过 GitHub Webhook 触发；手动同步仅建议用于演示与故障恢复。
            </p>
          </section>

          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.05rem] font-semibold">同步事件</h2>
              <span className="text-[0.68rem] text-[var(--color-ink-faint)]">最近 12 条</span>
            </div>
            {syncEvents.length === 0 ? (
              <p className="py-5 text-[0.78rem] text-[var(--color-ink-faint)]">暂无同步事件。</p>
            ) : (
              <ul>
                {syncEvents.map((event) => (
                  <li key={event.id} className="border-b border-[var(--color-line)] py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="mono text-[0.72rem]">{event.eventName}</span>
                      <span
                        className={`chip ${event.status === "PROCESSED" ? "chip-moss" : event.status === "FAILED" ? "chip-accent" : ""}`}
                      >
                        {SYNC_STATUS_LABELS[event.status] ?? event.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[0.66rem] text-[var(--color-ink-faint)]">
                      {event.repoId ?? "—"} · {timeAgo(event.receivedAt)}
                    </p>
                    {event.error ? (
                      <p className="mt-1 text-[0.66rem] leading-relaxed text-[var(--color-accent)]">{event.error}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
