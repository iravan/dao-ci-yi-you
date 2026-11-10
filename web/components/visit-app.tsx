"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  apiBase,
  loadAreas,
  loadComments,
  postComment,
  socketUrl,
} from "@/lib/api";
import { areaId, busyFromCounts, formatBlock } from "@/lib/area";
import { demoEnabled } from "@/lib/demo";
import { samplePlace } from "@/lib/sample-place";
import { browserSupabase } from "@/lib/supabase";
import type { BusyCell, Comment, Provider } from "@/lib/types";
import { CommentSheet } from "@/components/comment-sheet";
import { TokenNotice } from "@/components/token-notice";

const MapStage = dynamic(() => import("@/components/map-stage"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading the map</div>,
});

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "apple", label: "Apple" },
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
];

type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type DemoState = "read" | "wait" | "token" | "other";

const DEMO_STATES: { id: DemoState; label: string }[] = [
  { id: "read", label: "Signed out" },
  { id: "wait", label: "Waiting for a token" },
  { id: "token", label: "Token arrived" },
  { id: "other", label: "Reading another block" },
];

export function VisitApp({ demo: forcedDemo = false }: { demo?: boolean }) {
  const search = useSearchParams();
  const demo = demoEnabled(forcedDemo, search.toString());
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState("");
  const [writable, setWritable] = useState<string | null>(null);
  const [tokenArea, setTokenArea] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">(
    "ready",
  );
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState<BusyCell[]>([]);
  const [demoState, setDemoState] = useState<DemoState>("read");
  const [scene, setScene] = useState<{
    here: string;
    comments: Record<string, Comment[]>;
  } | null>(null);
  const [demoExtra, setDemoExtra] = useState<Record<string, Comment[]>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const boundsRef = useRef<Bounds | null>(null);
  const fixRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const beatRef = useRef<(() => void) | null>(null);
  const flewRef = useRef(false);

  useEffect(() => {
    if (demo) return;
    const supabase = browserSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [demo]);

  useEffect(() => {
    if (demo || !session || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        fixRef.current = next;
        if (!flewRef.current) {
          flewRef.current = true;
          setFocus(`${next.latitude},${next.longitude}`);
        }
        beatRef.current?.();
      },
      () => {
        fixRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [demo, session]);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (demo || !accessToken || !apiBase) return;
    let stop = false;
    let socket: WebSocket | null = null;
    let timer = 0;
    let retry = 0;

    const connect = () => {
      if (stop) return;
      let ready = false;
      socket = new WebSocket(socketUrl(apiBase));
      const sendBeat = () => {
        const current = fixRef.current;
        if (!ready || document.hidden || !current || socket?.readyState !== WebSocket.OPEN) {
          return;
        }
        socket.send(
          JSON.stringify({
            type: "heartbeat",
            latitude: current.latitude,
            longitude: current.longitude,
          }),
        );
      };
      beatRef.current = sendBeat;
      const startBeats = () => {
        window.clearInterval(timer);
        if (document.hidden) return;
        sendBeat();
        timer = window.setInterval(sendBeat, 15_000);
      };
      const onVisibility = () => {
        if (!ready) return;
        if (document.hidden) {
          window.clearInterval(timer);
          return;
        }
        startBeats();
      };
      document.addEventListener("visibilitychange", onVisibility);
      socket.onopen = () => {
        socket?.send(
          JSON.stringify({ type: "auth", access_token: accessToken }),
        );
      };
      socket.onmessage = (event) => {
        let message: { type?: string; area?: string };
        try {
          message = JSON.parse(String(event.data)) as {
            type?: string;
            area?: string;
          };
        } catch {
          return;
        }
        if (message.type === "ready") {
          ready = true;
          startBeats();
          return;
        }
        if (message.type === "here" && message.area) {
          setWritable(message.area);
          return;
        }
        if (message.type === "token" && message.area) {
          setTokenArea(message.area);
          return;
        }
        if (message.type === "token_cleared") setTokenArea(null);
      };
      socket.onclose = () => {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        if (!stop && ready) retry = window.setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      stop = true;
      beatRef.current = null;
      window.clearInterval(timer);
      window.clearTimeout(retry);
      socket?.close();
      setWritable(null);
      setTokenArea(null);
    };
  }, [demo, session?.access_token]);

  useEffect(() => {
    if (demo || !selected) return;
    const area = selected;
    let cancel = false;
    if (!apiBase) {
      return;
    }
    loadComments(area).then(
      (next) => {
        if (cancel) return;
        setComments(next);
        setListStatus("ready");
      },
      () => {
        if (cancel) return;
        setComments([]);
        setListError("The list didn't load.");
        setListStatus("error");
      },
    );
    return () => {
      cancel = true;
    };
  }, [demo, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openArea(area: string) {
    setSelected(area);
    if (demo) {
      setListStatus("ready");
      return;
    }
    setComments([]);
    setListError("");
    setListStatus(apiBase ? "loading" : "ready");
  }

  function showDemo(next: DemoState) {
    setDemoState(next);
    if (!scene) return;
    if (next === "wait" || next === "token") {
      setSelected(scene.here);
      setListStatus("ready");
      return;
    }
    if (next === "other") {
      const [latCell, lngCell] = scene.here.split(":").map(Number);
      setSelected(`${latCell}:${lngCell + 1}`);
      setListStatus("ready");
    }
  }

  async function refreshAreas(bounds: Bounds) {
    boundsRef.current = bounds;
    if (!apiBase) return;
    try {
      setBusy(await loadAreas(bounds));
    } catch {
      setBusy([]);
    }
  }

  async function signIn(provider: Provider) {
    setAuthError("");
    const supabase = browserSupabase();
    if (!supabase) {
      setAuthError("Sign-in isn't configured.");
      return;
    }
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) setAuthError(error.message);
  }

  async function signOut() {
    setAuthError("");
    flewRef.current = false;
    fixRef.current = null;
    setSelected(null);
    await browserSupabase()?.auth.signOut();
    setSession(null);
  }

  const demoComments = useMemo(() => {
    const merged: Record<string, Comment[]> = {};
    for (const [area, list] of Object.entries(scene?.comments ?? {})) {
      merged[area] = [...list];
    }
    for (const [area, list] of Object.entries(demoExtra)) {
      merged[area] = [...(merged[area] ?? []), ...list];
    }
    return merged;
  }, [scene, demoExtra]);

  const shownBusy = demo
    ? busyFromCounts(
        Object.fromEntries(
          Object.entries(demoComments).map(([area, list]) => [area, list.length]),
        ),
      )
    : busy;
  const block = demo
    ? demoState === "read"
      ? null
      : (scene?.here ?? null)
    : session
      ? writable
      : null;
  const held =
    demo && (demoState === "token" || demoState === "other")
      ? (scene?.here ?? null)
      : demo
        ? null
        : tokenArea;
  const signedIn = demo ? demoState !== "read" : Boolean(session);
  const yours = block !== null && selected === block;
  const writing = !signedIn || !yours ? "read" : held === block ? "compose" : "wait";
  const sheetComments =
    demo && selected ? (demoComments[selected] ?? []) : comments;

  return (
    <div className={`visit${selected ? " sheet-open" : ""}`}>
      <MapStage
        busy={shownBusy}
        selectedArea={selected}
        writableArea={block}
        focus={focus}
        onSelect={openArea}
        onSettle={(bounds) => {
          boundsRef.current = bounds;
          if (demo) {
            if (scene) return;
            const latitude = (bounds.south + bounds.north) / 2;
            const longitude = (bounds.west + bounds.east) / 2;
            setScene({
              here: areaId(latitude, longitude),
              comments: samplePlace(latitude, longitude),
            });
            return;
          }
          void refreshAreas(bounds);
        }}
        onGrid={setGridOn}
      />

      <div className="chrome">
        <div className="brand">
          <h1>到此一遊</h1>
          <p>this block, for a day</p>
        </div>
        <div className="account">
          {demo ? (
            <label className="demo-field">
              <span>Demo</span>
              <select
                aria-label="Demo state"
                value={demoState}
                onChange={(event) => showDemo(event.target.value as DemoState)}
              >
                {DEMO_STATES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {demo ? (
            <Link className="text-button" href="/">
              Live
            </Link>
          ) : session ? (
            <div className="signed-in">
              <p>Signed in</p>
              <button type="button" className="text-button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="providers">
              {PROVIDERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void signIn(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {!demo && !session ? (
            <Link className="text-button" href="/demo">
              Demo
            </Link>
          ) : null}
          {authError ? <p className="sheet-error">{authError}</p> : null}
        </div>
      </div>

      {held ? (
        <TokenNotice
          key={`token-${held}`}
          area={held}
          onOpen={() => openArea(held)}
        />
      ) : null}

      {!gridOn && !selected ? (
        <p className="zoom-hint">Zoom in to see the blocks</p>
      ) : null}

      {selected ? (
        <CommentSheet
          key={`sheet-${selected}`}
          area={selected}
          comments={sheetComments}
          yours={yours}
          writing={writing}
          status={demo ? "ready" : listStatus}
          error={listError}
          onClose={() => setSelected(null)}
          onSubmit={async (text) => {
            if (demo) {
              if (!scene || held !== scene.here || selected !== scene.here) {
                throw new Error("A token is required.");
              }
              const stored = {
                id: `demo-${Date.now()}`,
                text,
                createdAt: new Date().toISOString(),
              };
              setDemoExtra((current) => ({
                ...current,
                [scene.here]: [...(current[scene.here] ?? []), stored],
              }));
              setDemoState("wait");
              return;
            }
            if (!session || !writable || tokenArea !== writable) {
              throw new Error("A token is required.");
            }
            const stored = await postComment(
              writable,
              text,
              session.access_token,
            );
            setComments((current) =>
              selected === writable
                ? [...current, stored].sort((a, b) =>
                    a.createdAt.localeCompare(b.createdAt),
                  )
                : current,
            );
            setTokenArea(null);
            if (boundsRef.current) void refreshAreas(boundsRef.current);
          }}
        />
      ) : null}

      <p className="sr-only">
        {block ? `Your block is ${formatBlock(block)}` : ""}
      </p>
    </div>
  );
}
