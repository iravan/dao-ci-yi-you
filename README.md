# 到此一遊

Map comments. The page is a Next.js app, the API is a Rust service, and the stored comments live in Redis. Sign-in is Supabase Auth: the page holds the session, and the API checks the token.

| Piece | What it is | Where |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 | `web/` |
| Backend | Axum 0.8 on Tokio | `server/` |
| Database | Redis (comments, presence, posting tokens) | `REDIS_URL` |
| Sign-in | Supabase Auth (OAuth session and JWKS) | browser and `server/` |

```mermaid
flowchart LR
  Web["Frontend<br/>Next.js 16 · React 19"]
  Api["Backend<br/>Axum 0.8 · Tokio"]
  Db[("Database<br/>Redis")]
  Auth["Supabase Auth"]

  Web -->|"HTTP /api<br/>WebSocket /api/ws"| Api
  Web -->|"OAuth sign-in<br/>session JWT"| Auth
  Api -->|"Bearer JWT<br/>checked against JWKS"| Auth
  Api -->|"read and write<br/>REDIS_URL"| Db
```

On Vercel, `/api` is rewritten to the Rust service and every other path goes to the Next.js app (`vercel.json`). Locally the page calls `NEXT_PUBLIC_API_URL` (for example `http://127.0.0.1:8787/api`) and the server listens on port 8787. See [web/README.md](web/README.md) for how to run each part.

## Redis

One Redis database, `REDIS_URL`. Nothing is created ahead of time. The first write creates each key. `{user}` is the Supabase user id (`sub`). `{area}` is `floor(latitude / 0.001):floor(longitude / 0.001)`. `{id}` is a new UUID.

Two keys carry a Redis TTL. Redis deletes them when the time runs out. The other four stay until the server removes them.

| Key | Type | Value | Redis TTL | Removed by the server |
| --- | --- | --- | --- | --- |
| `comment:{id}` | string | JSON `{ "text", "area", "created_at" }` | 86400 seconds | The next read `ZREM`s the id after the string is gone, or when the JSON is older than 24 hours. |
| `presence:{user}` | string | `{area}` from the latest heartbeat | 45 seconds | A new heartbeat replaces it. |
| `token:{user}` | string | `{area}` the token is for | none | Deleted when the comment is posted, the visitor moves to another block, or their `active` score is older than 45 seconds. |
| `active` | sorted set | member = `{user}`, score = heartbeat unix seconds | none | That member is `ZREM`ed when the score is older than 45 seconds. |
| `area:{area}` | sorted set | member = comment id, score = `created_at` unix seconds | none | `DEL`eted when its last live comment is gone. |
| `areas` | set | member = `{area}` | none | That block is `SREM`ed in the same step. |

Anyone can read a block. `GET /api/areas/{area}/comments` does not check sign-in. The token is only for posting.

**Post.** One script, signed in, token required. The text must be non-empty and at most 280 characters. `GET token:{user}` and `GET presence:{user}` must both be this `{area}`. Then `SET comment:{id}` with `EX 86400`, `ZADD area:{area}` (score = unix seconds, member = `{id}`), `DEL token:{user}`, `SADD areas {area}`.

**List.** `ZRANGE area:{area} 0 -1` returns the ids, oldest first. `GET comment:{id}` returns `{ "text", "area", "created_at" }`. A missing string, or JSON older than 24 hours, is `ZREM`ed from `area:{area}`. A body that is still present but too old is also `DEL`eted. `ZCARD area:{area}` then, when the count is 0, `DEL area:{area}` and `SREM areas {area}`. The response is `{ "comments": [ { "id", "text", "area", "created_at" } ] }`.

**Map counts.** `GET /api/areas` does `SMEMBERS areas`, runs the same live-id read for each block in view, and returns a block only when two or more comments are still live. One comment is not filled on the map. Tapping that block still runs the list above.

**Sweep.** Every `TOKEN_RELEASE_SECS` (default 1), `SMEMBERS areas` and the same live-id cleanup, so expired comments leave the map without waiting for a tap.

**Heartbeat.** `SET presence:{user} {area} EX 45` and `ZADD active` (score = now, member = `{user}`). `GET token:{user}`. When that value is a different block, `DEL token:{user}`.

**Release.** On the same interval, `ZRANGE active 0 -1 WITHSCORES`. A member whose score is older than 45 seconds is `ZREM`ed, and `DEL token:{user}` runs for them. A member who is still present and `EXISTS token:{user}` is false receives one: `GET presence:{user}`, then `SET token:{user}` to that area.

**Socket open.** `GET token:{user}`. When the key is there, the server sends `{ "type": "token", "area" }` on that socket.

## How it works

The map is split into blocks of `0.001°` (about a city block). Anyone can read a block. A signed-in visitor can write on the block they are standing in, and only while they hold a token. A comment is at most 280 characters and lasts 24 hours. A block with two or more live comments is marked busy.

### Browse and read

```mermaid
flowchart TD
  Open[Open the map] --> Tiles[MapLibre draws OpenStreetMap tiles]
  Tiles --> Move[Pan or zoom]
  Move --> Grid{View is 80 blocks or fewer on each side?}
  Grid -->|yes| Lines[Draw the block grid]
  Grid -->|no| Hint[Show the zoom hint]
  Move --> Counts["GET /api/areas for this view"]
  Counts --> Busy[Shade each block with 2 or more comments and show the count]
  Lines --> Tap[Tap the map]
  Hint --> Tap
  Busy --> Tap
  Tap --> Sheet[Open that block's sheet]
  Sheet --> List["GET /api/areas/{block}/comments"]
  List --> Read[Show comments from the last 24 hours, oldest first]
  Read --> Close[Close the sheet or press Escape]
```

With no API address, as on the GitHub Pages build, the map and the sheet still open. The list stays empty and nothing is posted.

### Sign in and stay on a block

```mermaid
flowchart TD
  Providers[Apple, Google, or Facebook] --> OAuth[Supabase OAuth]
  OAuth --> Session[Browser keeps the session]
  Session --> Fly[First GPS fix flies the map there]
  Fly --> Socket[Open WebSocket /api/ws]
  Socket --> AuthMsg["Send auth with the access token"]
  AuthMsg --> Check{JWT audience is authenticated and provider is allowed?}
  Check -->|no| Reject[Socket closes. Sign-in required, or provider not allowed]
  Check -->|yes| Ready[Server replies ready]
  Ready --> Beat[Every 15 seconds, while the tab is visible, send GPS]
  Beat --> Presence["Store presence for 45 seconds and reply here"]
  Presence --> Outline[Outline that block as yours]
  Beat --> Hidden[A hidden tab pauses the heartbeat]
  Presence --> Drift{GPS moves to another block?}
  Drift -->|yes| ClearHeld[Drop the token and reply token_cleared]
  Presence --> Stale{No heartbeat for 45 seconds?}
  Stale -->|yes| Drop[Leave the active set and drop the token]
  Session --> Out[Sign out clears the fix, the sheet, and the socket]
```

### Token and a comment

Every `TOKEN_RELEASE_SECS` (default 1 second) the server walks everyone still active. Someone who does not already hold a token receives one, tied to the block in their latest presence.

```mermaid
flowchart TD
  Wait[Signed in and present on a block] --> Grant{Release interval and no token held?}
  Grant -->|no| Wait
  Grant -->|yes| Notice[Token notice names the block]
  Notice --> Compose[Open it and the composer is there]
  Compose --> Other[Any other block stays read-only]
  Compose --> Draft[Write up to 280 characters]
  Draft --> Post["POST the comment with the bearer token"]
  Post --> Rules{Text is non-empty, token matches, and presence is still this block?}
  Rules -->|no| Deny[Empty, too long, token required, or not your block]
  Rules -->|yes| Save[Store the comment for 24 hours and spend the token]
  Save --> Refresh[Sheet gains the comment and the busy counts reload]
  Refresh --> Wait
```

A spent token, a move to another block, or a lapsed presence all return the visitor to waiting.

### Demo

`/demo`, or `?demo=1` on any page, walks the same screens without Supabase, GPS, or the API. The sample notes sit in the block under the map center and the two blocks north and east of it. A demo post stays in the browser and returns the control to waiting.

```mermaid
flowchart LR
  Demo[Demo control] --> Out[Signed out]
  Demo --> Waiting[Waiting for a token]
  Demo --> Held[Token arrived]
  Demo --> East[Reading another block]
  Out --> Map[Map and sample comments only]
  Waiting --> Yours[Your block, no composer]
  Held --> Write[Composer on your block]
  East --> Look[The next block east, read only]
  Write --> Local[Post stays on this page]
  Local --> Waiting
```
