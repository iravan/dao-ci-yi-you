"use client";

import { formatBlock } from "@/lib/area";

type TokenNoticeProps = {
  area: string;
  onOpen: () => void;
};

export function TokenNotice({ area, onOpen }: TokenNoticeProps) {
  const name = formatBlock(area);
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
