import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  GitCommit,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPaperDetail } from "@/lib/queries";
import {
  categoryName,
  hasRole,
  LICENSE_LABELS,
  PAPER_STATUS_LABELS,
  type PaperStatus,
} from "@/lib/constants";
import { formatDate, formatDateTime, readingMinutes, shortSha, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";
import { VoteControl } from "@/components/vote-control";
import { Discussion } from "@/components/discussion";
import { reportAction } from "@/app/actions";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = { error?: string; reported?: string; submitted?: string; commentSort?: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getPaperDetail(id);
  if (!detail) return { title: "论文未找到" };
  return {
    title: detail.paper.title,
    description: detail.paper.abstract.slice(0, 180),
    openGraph: {
      title: detail.paper.title,
      description: detail.paper.abstract.slice(0, 180),
      type: "article",
      publishedTime: detail.paper.publishedAt?.toISOString(),
    },
  };
}

export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getCurrentUser();
  const detail = await getPaperDetail(id, viewer?.id);

  if (!detail) notFound();

  const { paper, raw, versions, currentVersion, votes, userVote } = detail;
  const isOwner = !!viewer && raw.submittedById === viewer.id;
  const isModerator = !!viewer && hasRole(viewer.role, "MODERATOR");
  const canView = paper.status === "PUBLISHED" || isOwner || isModerator;
  if (!canView) notFound();

  const repo = process.env.GITHUB_CONTENT_REPO;
  const branch = process.env.GITHUB_CONTENT_BRANCH || "main";
  const fileUrl = repo ? `https://github.com/${repo}/blob/${branch}/${raw.path}` : null;
  const commitUrl =
    repo && raw.currentCommitSha
      ? `https://github.com/${repo}/commit/${raw.currentCommitSha}`
      : null;
  const sort = query.commentSort === "top" ? "top" : "oldest";
  const publishedYear = paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : new Date().getFullYear();

  return (
    <article className="container-page py-6 sm:py-9">
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-[var(--color-ink-faint)]">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]">
          <ArrowLeft className="h-3 w-3" aria-hidden />
          论文
        </Link>
        <span aria-hidden>/</span>
        {paper.categories[0] && (
          <>
            <Link href={`/categories/${paper.categories[0]}`} className="hover:text-[var(--color-accent)]">
              {categoryName(paper.categories[0])}
            </Link>
            <span aria-hidden>/</span>
          </>
        )}
        <span className="max-w-[18rem] truncate sm:max-w-md">{paper.title}</span>
      </nav>

      {(query.error || query.reported || query.submitted) && (
        <div className={`mb-5 ${query.error ? "banner banner-error" : "banner banner-ok"}`}>
          {query.error ??
            (query.submitted
              ? "提交成功。论文已进入审核队列，管理员批准后会出现在公开列表中。"
              : "举报已记录，管理员会尽快处理。")}
        </div>
      )}

      <header>
        <div className="flex flex-wrap items-center gap-2 text-[0.72rem]">
          {paper.categories.map((category) => (
            <Link key={category} href={`/categories/${category}`} className="chip">
              <span className="mono text-[0.65rem]">{category}</span>
              {categoryName(category)}
            </Link>
          ))}
          {paper.status !== "PUBLISHED" && (
            <span className="chip chip-accent">
              {PAPER_STATUS_LABELS[paper.status as PaperStatus] ?? paper.status}
            </span>
          )}
          <span className="text-[var(--color-ink-faint)]">{paper.language}</span>
        </div>

        <h1 className="mt-4 max-w-4xl font-serif text-[1.85rem] font-semibold leading-[1.22] tracking-tight sm:text-[2.5rem]">
          {paper.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {paper.authors.map((author, index) => (
              <li key={`${author.name}-${index}`}>
                <Link
                  href={author.login ? `/authors/${author.login}` : `/search?q=${encodeURIComponent(author.name)}`}
                  className="group flex items-center gap-2"
                >
                  <Avatar src={author.login ? undefined : undefined} name={author.name} size={26} />
                  <span>
                    <span className="block text-[0.82rem] font-medium group-hover:text-[var(--color-accent)]">
                      {author.name}
                    </span>
                    {author.affiliation && (
                      <span className="block text-[0.68rem] text-[var(--color-ink-faint)]">
                        {author.affiliation}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-line)] pt-3 text-[0.72rem] text-[var(--color-ink-faint)]">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" aria-hidden />
            <a href="#discussion" className="hover:text-[var(--color-ink)]">
              {paper.commentCount} 条讨论
            </a>
          </span>
          <span className="inline-flex items-center gap-1">
            <GitCommit className="h-3 w-3" aria-hidden />
            {versions.length} 个版本
          </span>
          <span>首次发布 {formatDate(paper.publishedAt)}</span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" aria-hidden />
            约 {readingMinutes(currentVersion?.bodyMarkdown ?? "")} 分钟读完
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            索引同步于 {formatDateTime(raw.syncedAt)}
          </span>
        </div>
      </header>

      <div className="mt-6 detail-grid">
        <aside className="order-1 space-y-5 lg:order-2">
          <VoteControl
            paperId={paper.id}
            score={votes.score}
            upvotes={votes.upvotes}
            downvotes={votes.downvotes}
            userVote={userVote}
            disabled={!viewer || paper.status !== "PUBLISHED"}
          />

          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)]">
            <h2 className="border-b border-[var(--color-line)] px-4 py-2.5 font-serif text-[0.95rem] font-semibold">
              元数据
            </h2>
            <dl className="space-y-2.5 px-4 py-3.5 text-[0.74rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-faint)]">paperId</dt>
                <dd className="mono text-[0.66rem]">{paper.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-faint)]">许可</dt>
                <dd>{LICENSE_LABELS[paper.license] ?? paper.license}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-faint)]">语言</dt>
                <dd>{paper.language}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-faint)]">当前 commit</dt>
                <dd className="mono text-[0.66rem]">
                  {commitUrl ? (
                    <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-accent)]">
                      {shortSha(raw.currentCommitSha)}
                    </a>
                  ) : (
                    shortSha(raw.currentCommitSha)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-faint)]">内容路径</dt>
                <dd className="mono max-w-[11rem] truncate text-[0.66rem]" title={raw.path}>
                  {raw.path}
                </dd>
              </div>
              {paper.keywords.length > 0 && (
                <div className="border-t border-[var(--color-line)] pt-2.5">
                  <dt className="mb-1.5 text-[var(--color-ink-faint)]">关键词</dt>
                  <dd className="flex flex-wrap gap-1">
                    {paper.keywords.map((keyword) => (
                      <Link
                        key={keyword}
                        href={`/search?q=${encodeURIComponent(keyword)}`}
                        className="chip"
                      >
                        {keyword}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4 text-[0.75rem]">
            <h2 className="font-serif text-[0.95rem] font-semibold">溯源</h2>
            <ul className="mt-2.5 space-y-2 text-[var(--color-ink-soft)]">
              {fileUrl ? (
                <li>
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]">
                    GitHub 原文 <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              ) : (
                <li className="text-[var(--color-ink-faint)]">演示模式：正文来自本地内容仓库</li>
              )}
              {raw.discussionUrl && (
                <li>
                  <a href={raw.discussionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]">
                    讨论 Issue #{raw.githubIssueNumber}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              )}
              {paper.sourceUrl && (
                <li>
                  <a href={paper.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]">
                    原始来源 <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              )}
              <li>
                <Link href={`/papers/${paper.id}/versions`} className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]">
                  版本历史与 diff
                </Link>
              </li>
            </ul>
          </section>

          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
            <h2 className="font-serif text-[0.95rem] font-semibold">引用</h2>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-paper-sunk)] p-2.5 font-mono text-[0.62rem] leading-relaxed text-[var(--color-ink-soft)]">
{`@misc{${paper.id},
  title  = {${paper.title}},
  author = {${paper.authors.map((a) => a.name).join(" and ")}},
  year   = {${publishedYear}},
  note   = {RuArXiv, ${paper.id}}
}`}
            </pre>
          </section>

          <details className="text-[0.75rem]">
            <summary className="text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
              举报这篇论文
            </summary>
            <form action={reportAction} className="mt-2 space-y-2 border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-3">
              <input type="hidden" name="paperId" value={paper.id} />
              <select name="reason" className="field text-[0.78rem]" aria-label="举报原因">
                <option>版权投诉</option>
                <option>不当内容</option>
                <option>数据或结果问题</option>
                <option>垃圾信息</option>
                <option>其他</option>
              </select>
              <textarea
                name="detail"
                rows={3}
                className="field text-[0.78rem]"
                placeholder="请提供具体说明或证据链接"
                aria-label="举报说明"
              />
              <button type="submit" className="btn btn-outline btn-sm w-full">
                提交举报
              </button>
            </form>
          </details>
        </aside>

        <div className="order-2 min-w-0 lg:order-1">
          {paper.status === "PENDING_REVIEW" && (
            <div className="banner mb-6">
              这篇论文正在审核中，尚未进入公开列表与搜索索引。
            </div>
          )}

          {currentVersion ? (
            <Markdown>{currentVersion.bodyMarkdown}</Markdown>
          ) : (
            <p className="text-sm text-[var(--color-ink-faint)]">该论文还没有可展示的正文快照。</p>
          )}

          <section className="mt-12 border-t border-[var(--color-line)] pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-[1.35rem] font-semibold">版本历史</h2>
              <Link
                href={`/papers/${paper.id}/versions`}
                className="text-[0.72rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]"
              >
                查看全部 diff
              </Link>
            </div>
            <ol className="mt-4 space-y-2">
              {versions.slice(0, 4).map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-line)] py-2 text-[0.75rem]"
                >
                  <span className="mono text-[0.7rem] text-[var(--color-ink-soft)]">{shortSha(version.commitSha)}</span>
                  {version.isCurrent && <span className="chip chip-moss">当前</span>}
                  <span className="min-w-0 flex-1 truncate text-[var(--color-ink-soft)]">
                    {version.message ?? "同步版本"}
                  </span>
                  {version.prNumber && <span className="mono text-[0.65rem] text-[var(--color-ink-faint)]">PR #{version.prNumber}</span>}
                  <time className="text-[0.68rem] text-[var(--color-ink-faint)]" dateTime={version.createdAt.toISOString()}>
                    {formatDate(version.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-12">
            <Discussion
              paperId={paper.id}
              comments={detail.comments}
              discussionUrl={raw.discussionUrl}
              issueNumber={raw.githubIssueNumber}
              viewer={viewer ? { login: viewer.login, role: viewer.role } : null}
              sort={sort}
            />
          </div>

          <p className="mt-10 text-[0.68rem] text-[var(--color-ink-faint)]">
            最后同步 {timeAgo(raw.syncedAt)} · 内容 sha256{" "}
            <span className="mono">{shortSha(versions[0]?.contentSha256)}</span>
          </p>
        </div>
      </div>
    </article>
  );
}
