"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { voteAction } from "@/app/actions";

type Props = {
  paperId: string;
  score: number;
  upvotes: number;
  downvotes: number;
  userVote: number;
  disabled?: boolean;
};

export function VoteControl({ paperId, score, upvotes, downvotes, userVote, disabled }: Props) {
  const [state, setState] = useState({ score, upvotes, downvotes, userVote });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cast = (value: 1 | -1) => {
    if (disabled) return;
    const previous = state;
    const isSame = state.userVote === value;
    const nextVote = isSame ? 0 : value;

    setState({
      score: state.score + (nextVote - state.userVote),
      upvotes: state.upvotes + (nextVote === 1 ? 1 : 0) - (state.userVote === 1 ? 1 : 0),
      downvotes: state.downvotes + (nextVote === -1 ? 1 : 0) - (state.userVote === -1 ? 1 : 0),
      userVote: nextVote,
    });
    setError(null);

    startTransition(async () => {
      const result = await voteAction(paperId, value);
      if (!result.ok) {
        setState(previous);
        setError(result.error ?? "投票失败，请稍后重试");
        return;
      }
      setState({
        score: result.score ?? previous.score,
        upvotes: result.upvotes ?? previous.upvotes,
        downvotes: result.downvotes ?? previous.downvotes,
        userVote: result.userVote ?? nextVote,
      });
    });
  };

  return (
    <div className="score-panel">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="vote-btn"
          data-active={state.userVote === 1}
          aria-label="赞同这篇论文"
          aria-pressed={state.userVote === 1}
          onClick={() => cast(1)}
          disabled={disabled || pending}
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0">
          <div className="stat-number text-[1.7rem]">{state.score}</div>
          <div className="text-[0.65rem] text-[var(--color-ink-faint)]">社区评分</div>
        </div>
        <button
          type="button"
          className="vote-btn"
          data-down="true"
          data-active={state.userVote === -1}
          aria-label="反对这篇论文"
          aria-pressed={state.userVote === -1}
          onClick={() => cast(-1)}
          disabled={disabled || pending}
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[0.68rem] text-[var(--color-ink-faint)]">
        <span className="tabular">{state.upvotes} 赞</span>
        <span className="tabular">{state.downvotes} 踩</span>
      </div>
      {disabled && (
        <p className="mt-2 text-[0.68rem] leading-relaxed text-[var(--color-ink-faint)]">
          登录后可参与投票
        </p>
      )}
      {error && <p className="mt-2 text-[0.7rem] text-[var(--color-accent)]">{error}</p>}
    </div>
  );
}
