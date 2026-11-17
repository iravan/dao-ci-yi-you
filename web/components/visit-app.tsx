"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  apiBase,
  eventsUrl,
  loadAreas,
  loadComments,
  loadStep,
  postComment,
  socketUrl,
} from "@/lib/api";
import {
  areaId,
  busyFromCounts,
  DEFAULT_STEP,
  formatBlock,
  parseArea,
  southwest,
} from "@/lib/area";
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

const SSO: { id: Provider; label: string }[] = [
  { id: "google", label: "Sign in with Google" },
  { id: "apple", label: "Sign in with Apple" },
  { id: "facebook", label: "Sign in with Facebook" },
];

const PROVIDERS = ssoProviders();

function SsoBadge({ id }: { id: Provider }) {
  if (id === "google") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden>
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
        />
        <path
          fill="#FF3D00"
          d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C39.2 36.6 44 32 44 24c0-1.3-.1-2.7-.4-3.5z"
        />
      </svg>
    );
  }
  if (id === "apple") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-.9-2.5-3.9zM14.7 6.6c.6-.8 1.1-1.9.9-3-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.5 2.9-1.3z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M14.5 8.5V6.3c0-.7.5-1 1.1-1h1.9V2.5L15.2 2.4c-2.6 0-4.3 1.6-4.3 4.4v1.7H8.5V12h2.4v9.5h3.6V12h2.5l.4-3.5h-2.9z"
      />
    </svg>
  );
}

function ssoProviders(): { id: Provider; label: string }[] {
  const enabled = new Set(
    (process.env.NEXT_PUBLIC_SSO_PROVIDERS || "google,apple")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const providers = SSO.filter((item) => enabled.has(item.id));
  return providers.length > 0
    ? providers
    : SSO.filter((item) => item.id === "google" || item.id === "apple");
}

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
  const [signingIn, setSigningIn] = useState<Provider | null>(null);
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
  const [fix, setFix] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const [step, setStep] = useState(DEFAULT_STEP);
  const boundsRef = useRef<Bounds | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
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
        rememberFix(position.coords.latitude, position.coords.longitude, true);
      },
      () => {
        fixRef.current = null;
        setFix(null);
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
    if (demo || !apiBase) return;
    let cancel = false;
    void loadStep().then((next) => {
      if (!cancel && next) setStep(next);
    });
    return () => {
      cancel = true;
    };
  }, [demo]);

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
    if (demo || !apiBase) return;
    const source = new EventSource(eventsUrl(apiBase));
    source.onmessage = (event) => {
      let comment: {
        id?: string;
        text?: string;
        area?: string;
        created_at?: string;
        count?: number;
      };
      try {
        comment = JSON.parse(String(event.data)) as typeof comment;
      } catch {
        return;
      }
      if (!comment.area || typeof comment.count !== "number") return;
      const area = comment.area;
      const count = comment.count;
      if (comment.id && comment.text && comment.created_at && selectedRef.current === area) {
        const posted = {
          id: comment.id,
          text: comment.text,
          createdAt: comment.created_at,
        };
        setComments((current) =>
          current.some((item) => item.id === posted.id)
            ? current
            : [...current, posted].sort((a, b) =>
                a.createdAt.localeCompare(b.createdAt),
              ),
        );
        setListError("");
        setListStatus("ready");
      } else if (comment.id && !comment.text && selectedRef.current === area) {
        const id = comment.id;
        setComments((current) => current.filter((item) => item.id !== id));
      }
      setBusy((current) => {
        const without = current.filter((cell) => cell.area !== area);
        if (count < 2) return without;
        const placed = parseArea(area);
        if (!placed) return without;
        const corner = southwest(placed, step);
        return [
          ...without,
          { area, count, south: corner.latitude, west: corner.longitude },
        ];
      });
    };
    return () => source.close();
  }, [demo, step]);

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
    setSigningIn(provider);
    const supabase = browserSupabase();
    if (!supabase) {
      setSigningIn(null);
      setAuthError("Sign-in isn't configured.");
      return;
    }
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setSigningIn(null);
      setAuthError(error.message);
    }
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
        step,
      )
    : busy;
  const located = fix ? areaId(fix.latitude, fix.longitude, step) : null;
  const block = demo
    ? demoState === "read"
      ? null
      : (scene?.here ?? null)
    : (writable ?? located);

  function rememberFix(latitude: number, longitude: number, fly: boolean) {
    fixRef.current = { latitude, longitude };
    setFix({ latitude, longitude });
    if (fly && !flewRef.current) {
      flewRef.current = true;
      setFocus(`${latitude},${longitude}`);
    }
    beatRef.current?.();
  }
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
        step={step}
        onLocate={(latitude, longitude) => rememberFix(latitude, longitude, false)}
        onSelect={openArea}
        onSettle={(bounds) => {
          boundsRef.current = bounds;
          if (demo) {
            if (scene) return;
            const latitude = (bounds.south + bounds.north) / 2;
            const longitude = (bounds.west + bounds.east) / 2;
            setScene({
              here: areaId(latitude, longitude, step),
              comments: samplePlace(latitude, longitude, step),
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
                  className={`sso sso-${item.id}`}
                  disabled={signingIn !== null}
                  aria-busy={signingIn === item.id}
                  onClick={() => void signIn(item.id)}
                >
                  {signingIn === item.id ? (
                    <span className="sso-spinner" />
                  ) : (
                    <SsoBadge id={item.id} />
                  )}
                  {signingIn === item.id ? "Signing in" : item.label}
                </button>
              ))}
            </div>
          )}
          {authError ? <p className="sheet-error">{authError}</p> : null}
        </div>
      </div>

      {held ? (
        <TokenNotice
          key={`token-${held}`}
          area={held}
          step={step}
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
          step={step}
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
            await postComment(writable, text, session.access_token);
            setTokenArea(null);
            if (boundsRef.current) void refreshAreas(boundsRef.current);
          }}
        />
      ) : null}

      <p className="sr-only">
        {block ? `Your block is ${formatBlock(block, step)}` : ""}
      </p>
    </div>
  );
}
