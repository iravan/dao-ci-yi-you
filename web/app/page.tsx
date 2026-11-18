import { Suspense } from "react";
import { MapLoading } from "@/components/map-loading";
import { VisitApp } from "@/components/visit-app";

export default function Page() {
  return (
    <Suspense fallback={<MapLoading />}>
      <VisitApp />
    </Suspense>
  );
}
