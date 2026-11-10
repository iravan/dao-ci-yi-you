import type { BusyCell, Comment } from "@/lib/types";

export const MAX_COMMENT_LENGTH = 280;

export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

type ApiComment = {
  id: string;
  text: string;
  area: string;
  created_at: string;
};

export function socketUrl(base: string): string {
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
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
  if (!response.ok) throw new Error("The counts didn't load.");
  const body = (await response.json()) as { areas: BusyCell[] };
  return body.areas;
}

export async function loadComments(area: string): Promise<Comment[]> {
  const response = await fetch(
    `${apiBase}/areas/${encodeURIComponent(area)}/comments`,
  );
  if (!response.ok) throw new Error("The list didn't load.");
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
    throw new Error(body?.error ?? "The comment wasn't posted.");
  }
  if (!body?.id || !body.created_at) {
    throw new Error("The comment wasn't posted.");
  }
  return { id: body.id, text: body.text, createdAt: body.created_at };
}
