"use client";

import { formatBlock } from "@/lib/area";
import { useI18n } from "@/components/locale-provider";

type TokenNoticeProps = {
  area: string;
  step: number;
  onOpen: () => void;
};

export function TokenNotice({ area, step, onOpen }: TokenNoticeProps) {
  const { t } = useI18n();
  const name = formatBlock(area, step);
  return (
    <button type="button" className="token-notice" onClick={onOpen}>
      <span className="seal" aria-hidden>
        遊
      </span>
      <span className="token-copy">
        <span className="token-kicker">{t("token.new")}</span>
        <span className="token-block">{name}</span>
      </span>
    </button>
  );
}
