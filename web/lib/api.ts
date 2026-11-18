import type { BusyCell, Comment } from "@/lib/types";
import { serverErrorKey } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

export const MAX_COMMENT_LENGTH = 280;

/** A failure that already carries its translation key. */
export class ApiError extends Error {
  constructor(key: MessageKey) {
    super(key);
    this.name = "ApiError";
  }
}

// The page and the API share one origin: `/api` is rewritten to the Rust service.
export const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(
  /\/+$/,
  "",
);

type ApiComment = {
  id: string;
  text: string;
  area: string;
  created_at: string;
};

export function eventsUrl(base: string): string {
  return `${base}/events`;
}

export function socketUrl(base: string): string {
  // A relative base resolves against the page origin.
  const url = new URL(`${base}/ws`, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function loadStep(): Promise<number | null> {
  const response = await fetch(`${apiBase}/config`);
  if (!response.ok) return null;
  const body = (await response.json()) as { step?: number };
  const step = body.step;
  return typeof step === "number" && Number.isFinite(step) && step > 0
    ? step
    : null;
}

export async function loadAreas(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<BusyCell[]> {
  const params = new URLSearchParams({
    south: String(bounds.south),
    west: String(bounds.west),
    north: String(bounds.north),
    east: String(bounds.east),
  });
  const response = await fetch(`${apiBase}/areas?${params}`);
  if (!response.ok) throw new ApiError("error.counts");
  const body = (await response.json()) as { areas: BusyCell[] };
  return body.areas;
}

export async function loadComments(area: string): Promise<Comment[]> {
  const response = await fetch(
    `${apiBase}/areas/${encodeURIComponent(area)}/comments`,
  );
  if (!response.ok) throw new ApiError("error.list");
  const body = (await response.json()) as { comments: ApiComment[] };
  return body.comments.map((comment) => ({
    id: comment.id,
    text: comment.text,
    createdAt: comment.created_at,
  }));
}

export async function postComment(
  area: string,
  text: string,
  accessToken: string,
): Promise<Comment> {
  const response = await fetch(
    `${apiBase}/areas/${encodeURIComponent(area)}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | (ApiComment & { error?: string })
    | null;
  if (!response.ok) {
    throw new ApiError(serverErrorKey(body?.error));
  }
  if (!body?.id || !body.created_at) {
    throw new ApiError("error.post");
  }
  return { id: body.id, text: body.text, createdAt: body.created_at };
}
