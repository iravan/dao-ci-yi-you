"use client";

import { useI18n } from "@/components/locale-provider";

export function MapLoading() {
  const { t } = useI18n();
  return <div className="map-loading">{t("map.loading")}</div>;
}
