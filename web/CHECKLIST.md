# Frontend

The page in this folder. The build spec is [TECHNICAL.md](../TECHNICAL.md). The area id is `floor(latitude / 0.001):floor(longitude / 0.001)`. Rust computes it for every post, token, and comment list. The copy in `lib/area.ts` is only for drawing.

The page calls Rust when `NEXT_PUBLIC_API_URL` is set, and Supabase when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Without those, the map still opens and a tap shows an empty 24-hour list.

## Map

- [x] One Next.js route, map filled to the viewport, MapLibre loaded only in the browser. Its module worker is served at `/maplibre-gl-worker.mjs`, because the bundler does not place that file next to the library chunk.
- [x] OpenStreetMap raster tiles, with `© OpenStreetMap contributors` on the map.
- [x] Flat map: no pitch, no rotate.
- [x] Grid lines at `0.001` degrees. Southwest corner of a cell is `cell * 0.001`.
- [x] Grid is omitted when a viewport axis covers more than 80 cells, or when the view crosses the antimeridian. A short hint asks for a closer zoom.
- [x] Tap a cell to select it. Panning does not change the selected cell or the writable cell.
- [x] The writable cell is a solid outline. A selected cell that is not the writable one is a dashed outline.
- [x] A cell with 2 or more live comments is filled, and its count sits on the top edge, above the fill. A cell with one comment or none has no count and no fill.
- [x] `GET /areas?south&west&north&east` on move end. Draw only the cells in that response. A cell absent from the response is an ordinary grid line.
- [x] Refetch when the camera settles, and again after a successful post.
- [ ] Move the basemap off `tile.openstreetmap.org` before a public launch. Keep the same attribution line for OpenStreetMap data.

## Comments

- [x] The sheet lists comments oldest first. Empty copy is the 24-hour window, not a permanent empty room.
- [x] The count on a cell and the length of its list are the same set. The sample place has a 1-comment cell with no number, and cells of 2 and 3.
- [x] `GET /areas/{area}/comments` on tap, for everyone, signed in or not.
- [x] Show a loading state and a failure state. Do not keep a list from the previously opened cell.
- [x] The sample list is gone. Comments come from Rust.

## Sign-in

- [x] Three buttons: Apple, Google, Facebook. No email, phone, or other provider.
- [x] Supabase Auth on those three providers only. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [x] Signed out: map, grid, counts, read-only sheet, and the three buttons. No comment control, no token notice, no heartbeat, no writable outline.
- [x] Signed in: keep the Supabase access token for the socket and for `POST`.
- [x] Sign out closes the socket, clears the token notice, and returns to the signed-out page.
- [x] The real page has no preview control. Demo mode is `/demo` or `?demo=1`, and it is off by default.

## Position, presence, token

- [x] Writable outline, wait line, token notice, and composer exist as states. Preview walks them.
- [x] The notice names the current GPS block (its southwest corner) and stays up while another block is open. Activating it opens that GPS block.
- [x] The composer is mounted only when the open block is the GPS block and a token is held for it. Posting returns the sheet to the wait state.
- [x] Ask for a GPS fix only after sign-in. `watchPosition`. No fix: no outline, sheet stays read-only.
- [x] Open a WebSocket to the Rust service. First message: `{ "type": "auth", "access_token": "<supabase access token>" }`. After `{ "type": "ready" }`, a heartbeat every 15 seconds: `{ "type": "heartbeat", "latitude": <number>, "longitude": <number> }`.
- [x] Stop the heartbeat when the tab is hidden or the page closes, so the visitor leaves the draw.
- [x] On `{ "type": "token", "area": "<area>" }`, play the stamp animation and show the notice. The area in the message is the block name.
- [x] On `{ "type": "token_cleared" }`, close the composer and remove the notice.
- [x] `{ "type": "here", "area" }` is the writable outline. It is the cell Rust computed for this socket. A new GPS fix does not clear the notice by itself. Wait for `token_cleared`.
- [x] Reconnect the socket when the access token is refreshed. One Supabase user can have several tabs; each tab is another socket, not another draw.

## Posting

- [x] `POST /areas/{area}/comments` with `Authorization: Bearer <access token>` and `{ "text": "<text>" }`. `area` is the GPS block the server last computed, not a cell chosen on the map.
- [x] Reject an empty draft in the form. The maximum length is 280 characters, the same limit Rust enforces.
- [x] On success, append the stored comment, clear the composer, and return to waiting. On failure, keep the draft and show the error. Do not pretend the token was spent.
- [x] Next.js does not write comments and does not issue tokens.

## Checks

- [x] `22.3194, 114.1698` previews as `22319:114169`, southwest `22.319°N  114.169°E`.
- [x] `-0.0001` previews as cell `-1`, southwest `-0.001`.
- [x] Signed-out tap reads a list and never shows the composer.
- [x] Holding a token while reading another block keeps the composer closed and the notice pointed at the GPS block.
- [x] After a successful post, the wait state is back and the new comment is in the list.
