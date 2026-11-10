"use client";

import { useState } from "react";
import { formatBlock } from "@/lib/area";
import { MAX_COMMENT_LENGTH } from "@/lib/api";
import { formatAge } from "@/lib/format";
import type { Comment } from "@/lib/types";

type Writing = "read" | "wait" | "compose";
type Status = "loading" | "ready" | "error";

type CommentSheetProps = {
  area: string;
  comments: Comment[];
  yours: boolean;
  writing: Writing;
  status: Status;
  error: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
};

export function CommentSheet({
  area,
  comments,
  yours,
  writing,
  status,
  error,
  onClose,
  onSubmit,
}: CommentSheetProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [postError, setPostError] = useState("");
  const ordered = [...comments].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const trimmed = draft.trim();

  return (
    <aside className="sheet" role="dialog" aria-label={formatBlock(area)}>
      <header className="sheet-head">
        <div>
          <p className="sheet-area">{formatBlock(area)}</p>
          {yours ? <p className="sheet-yours">Your block</p> : null}
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="sheet-list">
        {status === "loading" ? (
          <p className="sheet-empty">Loading comments</p>
        ) : null}
        {status === "error" ? <p className="sheet-error">{error}</p> : null}
        {status === "ready" && ordered.length === 0 ? (
          <p className="sheet-empty">Nothing here in the last 24 hours.</p>
        ) : null}
        {status === "ready" && ordered.length > 0 ? (
          <ol>
            {ordered.map((comment) => (
              <li key={comment.id}>
                <p>{comment.text}</p>
                <time dateTime={comment.createdAt} title={comment.createdAt}>
                  {formatAge(comment.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {writing === "wait" ? (
        <div className="sheet-wait">
          <span className="seal seal-wait" aria-hidden>
            遊
          </span>
          <p>Waiting for a token.</p>
        </div>
      ) : null}
      {writing === "compose" ? (
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || pending) return;
            setPending(true);
            setPostError("");
            void onSubmit(trimmed).then(
              () => {
                setDraft("");
                setPending(false);
              },
              (reason: unknown) => {
                setPending(false);
                setPostError(
                  reason instanceof Error
                    ? reason.message
                    : "The comment wasn't posted.",
                );
              },
            );
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write in this block"
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            aria-label="Comment"
            autoFocus
          />
          <button type="submit" className="post" disabled={!trimmed || pending}>
            Post
          </button>
          {postError ? <p className="sheet-error">{postError}</p> : null}
        </form>
      ) : null}
    </aside>
  );
}
