"use client";

import { formatBlock } from "@/lib/area";

type TokenNoticeProps = {
  area: string;
  step: number;
  onOpen: () => void;
};

export function TokenNotice({ area, step, onOpen }: TokenNoticeProps) {
  const name = formatBlock(area, step);
  return (
    <button type="button" className="token-notice" onClick={onOpen}>
      <span className="seal" aria-hidden>
        遊
      </span>
      <span className="token-copy">
        <span className="token-kicker">New token</span>
        <span className="token-block">{name}</span>
      </span>
    </button>
  );
}
