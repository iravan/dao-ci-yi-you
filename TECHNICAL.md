# Technical design

This is how [DESIGN.md](DESIGN.md) is built. The repository still has no app code. Next.js is the page. A Rust service owns areas, comments, presence, and tokens. Redis stores them. OpenStreetMap is the basemap under the grid.

## Stack

| Piece | Choice | Role |
| --- | --- | --- |
| Page | Next.js | Map, grid, comment list, token wait state |
| Sign-in | Supabase Auth | Apple, Google, and Facebook only |
| Map | MapLibre GL JS, client only | OpenStreetMap raster basemap plus the grid |
| API | Rust, Axum, Tokio | Area snap, comments, heartbeat, token draw |
| Store | Redis | Comments with a 24-hour life, presence, tokens |
| Clock | Rust process | Deletes expired comments and releases tokens every 60 seconds |

The browser never decides the room id and never issues a token. Next.js does not write comments. It renders, signs the user in through Supabase, and calls the Rust service.

The public `tile.openstreetmap.org` images are the basemap for a light deployment, with `© OpenStreetMap contributors` on the map. They are already painted, and that service is for light browsing. A public launch moves the basemap to a tile host that allows the traffic. The grid is drawn by this app either way.

## Area id

The server snaps both coordinates. `step` is `0.001`. The cell index uses floor division, which matches the positive remainder in the product design and stays stable for negative coordinates.

```text
cell(value) = floor(value / 0.001)
area = cell(latitude) + ":" + cell(longitude)
```

The block's southwest corner on the map is `cell * 0.001`. Its width and height are `0.001` degrees. The client may preview the cell for drawing. A post, a token, and a comment list all use the `area` computed by Rust from the coordinates in that request.

## Page

One Next.js route. The map component is loaded only in the browser, because MapLibre uses WebGL.

Without a Supabase session the route renders the map only. There is no comment control and no token notice. `GET /areas` and `GET /areas/{area}/comments` stay public.

On each GPS fix a signed-in page sends latitude and longitude. The map outlines the cell Rust returns as the writable block. Panning does not change it. With no fix, no cell is outlined and the comment control stays closed.

The viewport asks Rust for counts:

```text
GET /areas?south&west&north&east
```

The response is the cells in that box whose live comment count is 2 or more. Each item is `area`, `count`, and the southwest corner. The page fills those cells. The count is a label anchored to the top edge of the cell, above the fill, so it sits on top of the area. A cell that is absent from the response is an ordinary grid line. Tapping a cell loads its list. This tap works with or without a session:

```text
GET /areas/{area}/comments
```

The list is every unexpired comment for that area, oldest first. The count on top of the cell and the length of this list are the same set. A cell with one comment has a list and no number on the map.

## Comments

A comment is one Redis string and one member of the area's sorted set.

```text
comment:{id}                  string, EX 86400
                              { "text", "area", "created_at" }
area:{area}                   ZSET
                              member = comment id, score = created_at unix seconds
```

`POST /areas/{area}/comments` checks four things, then writes both keys. The Supabase JWT is valid and the provider is Apple, Google, or Facebook. The user's latest coordinates snap to `{area}`. The user holds `token:{user}` and its value is that same `{area}`. The text is non-empty. The token key is deleted in the same step. A failed check writes nothing.

Reading a list runs `ZRANGE` and then `GET` for each id. A missing string means the 24-hour key expired. That id is removed from the sorted set and is not returned. The count for the map is the number of ids that still have a string. A cell is included in `GET /areas` only when that number is 2 or more.

A sweep every 60 seconds walks area sets and drops ids whose strings are already gone, so highlighted blocks disappear as comments age out.

## Sign-in

Supabase Auth is the only sign-in. In the Supabase project, Apple, Google, and Facebook are enabled. Email, phone, magic link, anonymous, and every other provider stay disabled. The page shows those three buttons and no other way in.

The Next.js session keeps the Supabase access token. Reading the map and the comment lists does not require it. The WebSocket, the heartbeat, and `POST /areas/{area}/comments` do. Rust checks the JWT against the Supabase JWKS, reads `sub` as the user id, and rejects a token whose provider is not `apple`, `google`, or `facebook`.

Redis keys use that `sub`. Two browsers signed in as the same user overwrite one `presence:{user}` and occupy one member of `active`. The draw runs once for that user.

## Presence and tokens

The signed-in page opens a WebSocket to the Rust service, sending the Supabase access token, and sends a heartbeat every 15 seconds with latitude and longitude. Rust snaps the area and refreshes:

```text
presence:{user}               string, EX 45, value = area
active                        ZSET
                              member = Supabase user id, score = unix seconds of this heartbeat
```

Every 60 seconds the release task removes `active` members whose score is older than 45 seconds, and deletes `token:{user}` for each of those. For every user still in `active` with no `token:{user}` key, it draws 1 in 4. A success writes:

```text
token:{user}                  string, value = the area from presence:{user}
```

The socket then sends `token` only on that user's open sessions. Other users receive nothing and stay in the wait state. On `token`, each open page for that user runs a short animation and shows a notice: a new token is ready for the current GPS block. The notice still appears when another block is open, and it points back to the GPS block, where the comment control opens. A heartbeat whose snapped area differs from the stored token deletes the token and sends `token_cleared`, which closes the control and ends the notice.

The comment control is shown only when the open block is the GPS block and the socket has a token for it. Posting uses the token. After a successful post the page returns to the wait state until a later release.

## First build

1. Supabase project with Apple, Google, and Facebook enabled, and every other sign-in provider disabled.
2. Rust service: JWT check, area snap, WebSocket heartbeat, 60-second token draw, comment post and list, viewport counts.
3. Next.js page: the map for everyone, counts on top of busy blocks, a comment list on tap, the three sign-in buttons, and, only after sign-in, the GPS block, token wait state, and token-arrived animation.
4. Redis on `127.0.0.1:6379` for local development.

## Out of scope

A public profile and a history past 24 hours are out of scope. Sign-in is only the Supabase user id used for the token draw. The page does not write to OpenStreetMap.
