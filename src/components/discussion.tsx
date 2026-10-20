import Link from "next/link";
import { CornerDownRight, ExternalLink } from "lucide-react";
import type { CommentNode } from "@/lib/queries";
import { hasRole, type Role } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { Markdown } from "./markdown";
import { commentAction } from "@/app/actions";

const REACTION_LABELS: Record<string, string> = {
  "+1": "赞",
  "-1": "踩",
  heart: "喜欢",
  hooray: "庆祝",
  rocket: "有价值",
  eyes: "关注",
  laugh: "有趣",
};

function ReactionPills({ reactions }: { reactions: Record<string, number> }) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {entries.map(([key, count]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-1.5 py-0.5 text-[0.66rem] text-[var(--color-ink-soft)]"
          title={`GitHub reaction: ${key}`}
        >
          <span aria-hidden>{REACTION_LABELS[key] ?? key}</span>
          <span className="tabular">{count}</span>
        </span>
      ))}
    </span>
  );
}

function CommentForm({
  paperId,
  parentId,
  placeholder,
  compact,
}: {
  paperId: string;
  parentId?: string;
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <form
      action={commentAction}
      className={`border border-[var(--color-line)] bg-[var(--color-paper-raised)] ${compact ? "p-2.5" : "p-3.5"}`}
    >
      <input type="hidden" name="paperId" value={paperId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="body"
        required
        rows={compact ? 2 : 4}
        placeholder={placeholder}
        className="field resize-y text-[0.85rem]"
        aria-label="评论内容"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[0.65rem] text-[var(--color-ink-faint)]">
          支持 Markdown；写入后会镜像到 GitHub Issue
        </span>
        <button type="submit" className="btn btn-primary btn-sm">
          发表评论
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  paperId,
  discussionUrl,
  depth,
  canComment,
}: {
  comment: CommentNode;
  paperId: string;
  discussionUrl: string | null;
  depth: number;
  canComment: boolean;
}) {
  const permalink =
    discussionUrl && comment.githubCommentId
      ? `${discussionUrl}#issuecomment-${comment.githubCommentId}`
      : null;

  return (
    <li className={`relative ${depth > 0 ? "mt-4" : ""}`}>
      <div className="flex gap-3">
        <Avatar src={comment.authorAvatarUrl} name={comment.authorName ?? comment.authorLogin} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-[var(--color-ink-faint)]">
            <Link
              href={`/authors/${comment.authorLogin}`}
              className="font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)]"
            >
              {comment.authorName ?? comment.authorLogin}
            </Link>
            <span>@{comment.authorLogin}</span>
            {comment.isAuthor && <span className="chip chip-moss">作者</span>}
            <span aria-hidden>·</span>
            <time dateTime={comment.createdAt.toISOString()}>{timeAgo(comment.createdAt)}</time>
            {permalink ? (
              <a
                href={permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]"
                title="在 GitHub 查看原始评论"
              >
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                GitHub
              </a>
            ) : (
              <span className="text-[0.65rem]">站内评论</span>
            )}
          </div>

          <div className="mt-1.5 prose-comment">
            <Markdown>{comment.body}</Markdown>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ReactionPills reactions={comment.reactions} />
            {canComment && (
              <details className="group">
                <summary className="list-none text-[0.68rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
                  回复
                </summary>
                <div className="mt-2">
                  <CommentForm
                    paperId={paperId}
                    parentId={comment.id}
                    placeholder={`回复 @${comment.authorLogin}`}
                    compact
                  />
                </div>
              </details>
            )}
          </div>

          {comment.replies.length > 0 && (
            <ul className="mt-1 border-l border-[var(--color-line)] pl-3 sm:pl-4">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  paperId={paperId}
                  discussionUrl={discussionUrl}
                  depth={depth + 1}
                  canComment={canComment}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function Discussion({
  paperId,
  comments,
  discussionUrl,
  issueNumber,
  viewer,
  sort,
}: {
  paperId: string;
  comments: CommentNode[];
  discussionUrl: string | null;
  issueNumber: number | null;
  viewer: { login: string; role: string } | null;
  sort: "oldest" | "top";
}) {
  const canComment = !!viewer && hasRole(viewer.role as Role, "INVITED_USER");
  const sorted = [...comments].sort((a, b) => {
    if (sort === "top") {
      const score = (node: CommentNode) =>
        Object.values(node.reactions).reduce((sum, count) => sum + count, 0);
      return score(b) - score(a);
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return (
    <section id="discussion" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)] pb-2">
        <div>
          <h2 className="font-serif text-[1.35rem] font-semibold">讨论</h2>
          <p className="mt-0.5 text-[0.75rem] text-[var(--color-ink-faint)]">
            {comments.length} 条可见评论
            {issueNumber ? ` · 对应 GitHub Issue #${issueNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[0.72rem]">
          <Link
            href={`/papers/${paperId}?commentSort=oldest#discussion`}
            className={sort === "oldest" ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"}
          >
            最早
          </Link>
          <Link
            href={`/papers/${paperId}?commentSort=top#discussion`}
            className={sort === "top" ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"}
          >
            最热
          </Link>
          {discussionUrl && (
            <a
              href={discussionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]"
            >
              原始 Issue
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      </div>

      <div className="mt-4">
        {viewer ? (
          canComment ? (
            <CommentForm paperId={paperId} placeholder="写下你的问题、复现结果或对方法的质疑…" />
          ) : (
            <div className="border border-[var(--color-line)] bg-[var(--color-paper-sunk)] px-4 py-3 text-[0.8rem] text-[var(--color-ink-soft)]">
              当前账号（@{viewer.login}）还没有评论权限。RuArXiv 采用邀请制，请联系管理员获取邀请后再参与讨论。
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-4 py-3">
            <p className="text-[0.82rem] text-[var(--color-ink-soft)]">
              使用 GitHub 登录后即可参与讨论，评论会同步到对应的 Issue。
            </p>
            <Link href={`/login?next=/papers/${paperId}`} className="btn btn-outline btn-sm">
              登录参与
            </Link>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="mt-8 border-t border-[var(--color-line)] pt-6 text-center text-sm text-[var(--color-ink-faint)]">
          还没有评论。第一条实质性意见往往比点赞更有价值。
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {sorted.map((comment) => (
            <li key={comment.id} className="border-t border-[var(--color-line)] pt-5">
              <CommentItem
                comment={comment}
                paperId={paperId}
                discussionUrl={discussionUrl}
                depth={0}
                canComment={canComment}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 flex items-start gap-1.5 text-[0.68rem] leading-relaxed text-[var(--color-ink-faint)]">
        <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        评论以 GitHub Issue 为内容源，站内保存快照用于检索与排序；冲突时以 GitHub 当前内容为准。
      </p>
    </section>
  );
}
