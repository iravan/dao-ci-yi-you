# Backend

The Rust service. The build spec is [TECHNICAL.md](../TECHNICAL.md). Next.js renders and signs in. This service snaps areas, stores comments, tracks presence, and issues tokens. Redis for local development is `127.0.0.1:6379`.

The area id is `floor(latitude / 0.001):floor(longitude / 0.001)`. The browser never chooses it. A post, a token, and a comment list all use the area computed from the coordinates on that request.

Wire contract, shared with [the frontend list](../web/CHECKLIST.md):

```text
GET  /areas?south&west&north&east
     { "areas": [ { "area", "count", "south", "west" } ] }

GET  /areas/{area}/comments
     { "comments": [ { "id", "text", "area", "created_at" } ] }   oldest first

POST /areas/{area}/comments
     Authorization: Bearer <supabase access token>
     { "text": "<text>" }
     -> the stored comment, or 4xx and no write

WebSocket, first client message:
     { "type": "auth", "access_token": "<supabase access token>" }
then every 15 seconds:
     { "type": "heartbeat", "latitude": <number>, "longitude": <number> }

Server, only to that user's open sockets:
     { "type": "token", "area": "<area>" }
     { "type": "token_cleared" }
```

## Service

- [ ] Axum and Tokio. One process owns the HTTP routes, the WebSocket, the 60-second token release, and the 60-second comment sweep.
- [ ] CORS allows the Next.js origin.
- [ ] Config: Redis URL, Supabase JWKS URL, and the clock interval. No tokens or comments are issued from Next.js.

## Area

- [ ] `cell(value) = floor(value / 0.001)`, including negative coordinates. `-0.0001` is cell `-1`, southwest corner `-0.001`. `22.3194` is cell `22319`, southwest `22.319`.
- [ ] Area id is `latCell:lngCell`. The block on the map is that corner, width and height `0.001`.
- [ ] Tests for negative coordinates, the exact boundary (the boundary belongs to the cell whose southwest corner is that value), and the equator and prime meridian.

## Auth

- [ ] Check the Supabase JWT against the project JWKS.
- [ ] User id is `sub`. Redis keys use that id.
- [ ] Provider comes from `app_metadata.provider`. Accept only `apple`, `google`, and `facebook`. Confirm the claim against a real token from the project before shipping.
- [ ] `GET /areas` and `GET /areas/{area}/comments` stay public.
- [ ] The WebSocket, the heartbeat, and `POST /areas/{area}/comments` require a valid token. Close the socket if the first message is not an accepted `auth`.

## Comments

- [ ] `comment:{id}` is a string, `EX 86400`, JSON `{ "text", "area", "created_at" }`.
- [ ] `area:{area}` is a sorted set. Member is the comment id. Score is `created_at` in unix seconds.
- [ ] `POST` writes both keys only after all of these pass: JWT and provider, latest coordinates snap to `{area}`, `token:{user}` exists and its value is that same area, text is non-empty. Then delete `token:{user}` in the same step.
- [ ] A failed check writes nothing and does not delete the token, except where a closer rule below says the token is already gone.
- [ ] Choose a maximum text length and enforce it here. The page uses the same limit.
- [ ] A mismatch between the path `{area}` and the snapped coordinates is rejected. Holding a token does not override that.
- [ ] `GET` runs `ZRANGE` and then `GET` each id. A missing string means the 24-hour key expired: remove that id from the sorted set and do not return it. Oldest first. A reader never receives a comment at 24 hours or older.
- [ ] `GET /areas` returns cells in the box whose live count is 2 or more. Live count is ids that still have a string. Each item is `area`, `count`, and the southwest corner. A cell with one comment is absent.

## Presence

- [ ] Heartbeat snaps the area and refreshes `presence:{user}` (`EX 45`, value is the area) and the `active` sorted set (member is `sub`, score is unix seconds of this heartbeat).
- [ ] Two browsers signed in as the same user overwrite one `presence:{user}` and occupy one member of `active`.
- [ ] A heartbeat whose snapped area differs from `token:{user}` deletes that token and sends `token_cleared` on that user's open sockets.
- [ ] No heartbeat for 45 seconds means the visitor is not active. A hidden or closed page stops the heartbeat, so the next release drops them.

## Tokens

- [ ] Every 60 seconds, on the server clock: remove `active` members whose score is older than 45 seconds, and delete `token:{user}` for each of those. Send `token_cleared` if a socket is still open.
- [ ] For every user still in `active` with no `token:{user}`, draw 1 in 4. A success writes `token:{user}` with the area currently in `presence:{user}`.
- [ ] Send `{ "type": "token", "area" }` only on that user's open sockets. Everyone else stays in the wait state and receives nothing.
- [ ] A user who already holds a token is skipped. Extra browsers do not add draws.
- [ ] An unspent token is not saved after the visit ends. It is dropped when the snapped area changes or when the visitor stops being active.
- [ ] Posting consumes the token. The page returns to waiting until a later release.

## Sweep

- [ ] Every 60 seconds, walk area sets and drop ids whose `comment:{id}` string is already gone, so a highlighted block disappears as comments age out.
- [ ] The map count and the list length stay the same set after a sweep.

## Local run

- [ ] Redis on `127.0.0.1:6379`.
- [ ] Service listens for the Next.js page. Document the URL the page calls (`NEXT_PUBLIC_API_URL`).
- [ ] Supabase project: Apple, Google, and Facebook enabled. Email, phone, magic link, anonymous, and every other provider disabled.

## Checks

- [ ] Public `GET` works with no session. `POST` and the socket do not.
- [ ] A token for area A is rejected for a post in area B, and the comment is not stored.
- [ ] After a successful post the token key is gone and a second post is rejected.
- [ ] A comment older than 24 hours is absent from the list and from the count. A cell that falls from 2 comments to 1 drops out of `GET /areas`.
- [ ] Two sockets for one user produce one presence key and one draw.
- [ ] A visitor with no heartbeat for 45 seconds is removed on the next release, and their token is deleted.
