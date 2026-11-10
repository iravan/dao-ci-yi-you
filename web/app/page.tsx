import { Suspense } from "react";
import { VisitApp } from "@/components/visit-app";

export default function Page() {
  return (
    <Suspense fallback={<div className="map-loading">Loading the map</div>}>
      <VisitApp />
    </Suspense>
  );
}
