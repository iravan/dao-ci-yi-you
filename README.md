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

## How it works

The map is split into blocks of `0.001°` (about a city block). Anyone can read a block. A signed-in visitor can write on the block they are standing in, and only while they hold a token. A comment lasts 24 hours. A block with two or more live comments is marked busy.

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

Once a minute the server walks everyone still active. Someone who does not already hold a token is offered one about one time in four. The token is tied to the block in their latest presence.

```mermaid
flowchart TD
  Wait[Signed in and present on a block] --> Grant{This minute's draw hits?}
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
