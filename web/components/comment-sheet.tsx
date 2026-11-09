"use client";

import { useState } from "react";
import { formatBlock } from "@/lib/area";
import { formatAge } from "@/lib/format";
import type { Comment } from "@/lib/types";

type Writing = "read" | "wait" | "compose";

type CommentSheetProps = {
  area: string;
  comments: Comment[];
  yours: boolean;
  writing: Writing;
  sample: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
};

export function CommentSheet({
  area,
  comments,
  yours,
  writing,
  sample,
  onClose,
  onSubmit,
}: CommentSheetProps) {
  const [draft, setDraft] = useState("");
  const ordered = [...comments].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const trimmed = draft.trim();

  return (
    <aside
      className="sheet"
      role="dialog"
      aria-label={formatBlock(area)}
    >
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
        {sample ? <p className="sample-tag">Sample</p> : null}
        {ordered.length === 0 ? (
          <p className="sheet-empty">Nothing here in the last 24 hours.</p>
        ) : (
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
        )}
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
            if (!trimmed) return;
            onSubmit(trimmed);
            setDraft("");
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write in this block"
            rows={3}
            aria-label="Comment"
            autoFocus
          />
          <button type="submit" className="post" disabled={!trimmed}>
            Post
          </button>
        </form>
      ) : null}
    </aside>
  );
}
