"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatBlock } from "@/lib/area";
import { MAX_COMMENT_LENGTH } from "@/lib/api";
import { errorText, formatAge } from "@/lib/i18n";
import { useI18n } from "@/components/locale-provider";
import type { Comment } from "@/lib/types";

type Writing = "read" | "wait" | "compose";
type Status = "loading" | "ready" | "error";

type CommentSheetProps = {
  area: string;
  step: number;
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
  step,
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
  const { t } = useI18n();
  const ordered = [...comments]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((comment, index, list) =>
      list.findIndex((item) => item.id === comment.id) === index,
    );
  const trimmed = draft.trim();
  const listRef = useRef<HTMLDivElement>(null);
  const latest = ordered.at(-1)?.id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [latest]);

  return (
    <aside className="sheet" role="dialog" aria-label={formatBlock(area, step)}>
      <header className="sheet-head">
        <div>
          <p className="sheet-area">{formatBlock(area, step)}</p>
          {yours ? <p className="sheet-yours">{t("sheet.yours")}</p> : null}
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          {t("sheet.close")}
        </button>
      </header>
      <div className="sheet-list" ref={listRef}>
        {status === "loading" ? (
          <p className="sheet-empty">{t("sheet.loading")}</p>
        ) : null}
        {status === "error" ? <p className="sheet-error">{error}</p> : null}
        {status === "ready" && ordered.length === 0 ? (
          <p className="sheet-empty">{t("sheet.empty")}</p>
        ) : null}
        {status === "ready" && ordered.length > 0 ? (
          <ol>
            {ordered.map((comment) => (
              <li key={comment.id}>
                <p>{comment.text}</p>
                <time dateTime={comment.createdAt} title={comment.createdAt}>
                  {formatAge(comment.createdAt, t)}
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
          <p>{t("sheet.waiting")}</p>
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
                setPostError(errorText(reason, t));
              },
            );
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder={t("sheet.placeholder")}
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            aria-label={t("sheet.comment")}
            autoFocus
          />
          <button type="submit" className="post" disabled={!trimmed || pending}>
            {t("sheet.post")}
          </button>
          {postError ? <p className="sheet-error">{postError}</p> : null}
        </form>
      ) : null}
    </aside>
  );
}
