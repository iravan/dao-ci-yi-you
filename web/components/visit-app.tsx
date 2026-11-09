"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { areaId, busyFromCounts, formatBlock } from "@/lib/area";
import { samplePlace } from "@/lib/sample-place";
import type { Comment, Fix, Provider } from "@/lib/types";
import { CommentSheet } from "@/components/comment-sheet";
import { TokenNotice } from "@/components/token-notice";

const MapStage = dynamic(() => import("@/components/map-stage"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading the map</div>,
});

type Preview =
  | "signed-out"
  | "sample"
  | "no-fix"
  | "waiting"
  | "token"
  | "other";

const PREVIEWS: { id: Preview; label: string }[] = [
  { id: "signed-out", label: "Signed out" },
  { id: "sample", label: "Sample place" },
  { id: "no-fix", label: "Signed in, no position" },
  { id: "waiting", label: "Waiting for a token" },
  { id: "token", label: "Token arrived" },
  { id: "other", label: "Reading another block" },
];

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "apple", label: "Apple" },
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
];

export function VisitApp() {
  const [preview, setPreview] = useState<Preview>("sample");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [anchor, setAnchor] = useState<Fix | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tokenArea, setTokenArea] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const [place, setPlace] = useState<Record<string, Comment[]> | null>(null);
  const [extra, setExtra] = useState<Record<string, Comment[]>>({});
  const previewRef = useRef(preview);
  const viewRef = useRef<Fix | null>(null);
  const framed = useRef(false);
  const gpsSnapped = useRef(false);
  const tokenAreaRef = useRef(tokenArea);

  useEffect(() => {
    previewRef.current = preview;
    tokenAreaRef.current = tokenArea;
  }, [preview, tokenArea]);

  const signedIn =
    preview === "no-fix" ||
    preview === "waiting" ||
    preview === "token" ||
    preview === "other";
  const trackFix = preview === "waiting" || preview === "token" || preview === "other";
  const writable = trackFix && anchor ? areaId(anchor.latitude, anchor.longitude) : null;

  function layoutAt(origin: Fix, mode: Preview) {
    if (mode === "signed-out") {
      setPlace(null);
      setAnchor(null);
      setTokenArea(null);
      setSelected(null);
      setExtra({});
      return;
    }

    const here = areaId(origin.latitude, origin.longitude);
    setPlace(samplePlace(origin.latitude, origin.longitude));
    setExtra({});

    if (mode === "sample" || mode === "no-fix") {
      setAnchor(null);
      setTokenArea(null);
      setSelected(null);
      return;
    }

    setAnchor(origin);
    if (mode === "waiting") {
      setTokenArea(null);
      setSelected(here);
      return;
    }
    if (mode === "token") {
      setTokenArea(here);
      setSelected(here);
      return;
    }

    const [latCell, lngCell] = here.split(":").map(Number);
    setTokenArea(here);
    setSelected(`${latCell}:${lngCell + 1}`);
  }

  function applyPreview(next: Preview, origin: Fix | null) {
    setPreview(next);
    if (next === "signed-out" || next === "sample") setProvider(null);
    if (!origin) return;
    layoutAt(origin, next);
  }

  useEffect(() => {
    if (!trackFix || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const here = areaId(next.latitude, next.longitude);
        if (!gpsSnapped.current) {
          gpsSnapped.current = true;
          setFocus(`${next.latitude},${next.longitude}`);
          layoutAt(next, previewRef.current);
          return;
        }
        if (tokenAreaRef.current && tokenAreaRef.current !== here) {
          setTokenArea(null);
          setSelected(here);
          setPreview("waiting");
        }
        setAnchor(next);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [trackFix]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commentsByArea = useMemo(() => {
    const merged: Record<string, Comment[]> = {};
    for (const [area, comments] of Object.entries(place ?? {})) {
      merged[area] = [...comments];
    }
    for (const [area, comments] of Object.entries(extra)) {
      merged[area] = [...(merged[area] ?? []), ...comments];
    }
    return merged;
  }, [place, extra]);

  const busy = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [area, comments] of Object.entries(commentsByArea)) {
      counts[area] = comments.length;
    }
    return busyFromCounts(counts);
  }, [commentsByArea]);

  const comments = selected ? (commentsByArea[selected] ?? []) : [];
  const yours = writable !== null && selected === writable;
  const writing = !yours ? "read" : tokenArea === writable ? "compose" : "wait";
  const providerLabel = PROVIDERS.find((item) => item.id === provider)?.label;

  return (
    <div className={`visit${selected ? " sheet-open" : ""}`}>
      <MapStage
        busy={busy}
        selectedArea={selected}
        writableArea={writable}
        focus={focus}
        onSelect={setSelected}
        onView={(fix) => {
          viewRef.current = fix;
          if (framed.current) return;
          framed.current = true;
          if (previewRef.current !== "signed-out") {
            layoutAt(fix, previewRef.current);
          }
        }}
        onGrid={setGridOn}
      />

      <div className="chrome">
        <div className="brand">
          <h1>到此一遊</h1>
          <p>this block, for a day</p>
        </div>
        <div className="account">
          {signedIn ? (
            <div className="signed-in">
              <p>{providerLabel ? `Preview · ${providerLabel}` : "Preview"}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  gpsSnapped.current = false;
                  setProvider(null);
                  applyPreview("signed-out", viewRef.current);
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="providers">
              {PROVIDERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setProvider(item.id);
                    applyPreview("waiting", viewRef.current);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <label className="preview-field">
            <span>Preview</span>
            <select
              aria-label="Preview a state"
              value={preview}
              onChange={(event) =>
                applyPreview(event.target.value as Preview, viewRef.current)
              }
            >
              {PREVIEWS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tokenArea ? (
        <TokenNotice
          key={`token-${tokenArea}`}
          area={tokenArea}
          onOpen={() => setSelected(tokenArea)}
        />
      ) : null}

      {!gridOn && !selected ? (
        <p className="zoom-hint">Zoom in to see the blocks</p>
      ) : null}

      {selected ? (
        <CommentSheet
          key={`sheet-${selected}`}
          area={selected}
          comments={comments}
          yours={yours}
          writing={writing}
          sample={place !== null}
          onClose={() => setSelected(null)}
          onSubmit={(text) => {
            if (!selected || tokenArea !== selected) return;
            const comment: Comment = {
              id: `local-${Date.now()}`,
              text,
              createdAt: new Date().toISOString(),
            };
            setExtra((current) => ({
              ...current,
              [selected]: [...(current[selected] ?? []), comment],
            }));
            setTokenArea(null);
            setPreview("waiting");
          }}
        />
      ) : null}

      <p className="sr-only">
        {writable ? `Your block is ${formatBlock(writable)}` : ""}
      </p>
    </div>
  );
}
