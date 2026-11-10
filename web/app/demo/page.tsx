import { Suspense } from "react";
import type { Metadata } from "next";
import { VisitApp } from "@/components/visit-app";

export const metadata: Metadata = {
  title: "到此一遊 demo",
};

export default function DemoPage() {
  return (
    <Suspense fallback={<div className="map-loading">Loading the map</div>}>
      <VisitApp demo />
    </Suspense>
  );
}
