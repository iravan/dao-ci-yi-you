# Scaling visits

How the comment loops stay cheap when many blocks have notes and many people have the page open. The current keys are listed in [README.md](README.md). This does not change the rules: a comment lasts 24 hours, a block is filled at 2 or more live comments, and a present visitor holds one token.

## The loop now

`serve` in `server/src/lib.rs` starts one background task. It waits `TOKEN_RELEASE_SECS` (default 1 second) between passes. The first interval tick fires immediately and is thrown away, so the first real pass is one interval after startup. Each pass does two jobs, in order: `sweep`, then `release`. A failure is logged and the next interval still runs. Heartbeats are not part of this task. They arrive on each visitor's socket.

**Sweep** drops comments whose expiry time has been reached. It does not visit blocks that still have live notes.

1. `ZRANGEBYSCORE expire -inf now` loads members `{area}|{id}` whose score is the unix time the comment expires.
2. A quiet second returns an empty list. That is the whole sweep.
3. For each member, one script `ZREM`s the id from `area:{area}`, `ZREM`s the member from `expire`, and `DECR`s `count:{area}`.
4. When the count falls below 2, the script `ZREM`s the block from `busy`. At 0 it `DEL`etes `count:{area}` and `area:{area}`.
5. Each removed note is published as `{ "id", "area", "count" }`. An open page drops that id from the list and updates that one cell. It does not call `GET /api/areas`.

**Release** drops visitors who stopped heartbeating, and gives a token only to people in `waiting`.

1. `ZRANGEBYSCORE active -inf (now - 45)` loads visitors whose last heartbeat is older than 45 seconds. Everyone still inside that window is not read.
2. Each stale visitor is `ZREM`ed from `active`, their `token:{user}` is `DEL`eted, and they are `SREM`ed from `waiting`. When a token was deleted, the socket receives `token_cleared`.
3. `SMEMBERS waiting` loads visitors who are present and do not hold a token.
4. For each of them, `GET presence:{user}`. When that key exists, `SET token:{user}` to that block, `SREM` them from `waiting`, and the socket receives `{ "type": "token", "area" }`. When presence is missing, they stay in `waiting` for a later pass.

A pass reads the comments that expired in that second, the visitors who went stale, and the visitors still waiting for a token. It does not read the other blocks, and it does not read visitors who already hold a token.

## What used to grow with every block

Before this change, `sweep` ran `SMEMBERS areas` and then `live_ids` on every block, every second. `GET /api/areas` loaded that same set and discarded blocks outside the view in the process. At 10,000 blocks that was a world scan on the timer and another world scan on every map request. The token pass used `ZRANGE active` and then `EXISTS token:{user}` for every present visitor.

## What a visit needs

| Request | Should touch |
| --- | --- |
| Map counts for this view | Blocks inside the view whose count is at least 2 |
| One block's comments | That block only |
| A comment expires | That comment's block only |
| Grant or drop a token | That visitor only |
| Tell open pages | One event, no second read of Redis |

The map already refuses to draw a grid wider than 80 cells on a side. A view is a small box. The store should answer with a box query, not a world scan.

## Store

Keep `comment:{id}`, `presence:{user}`, `token:{user}`, and `active`. Stop using `areas` as the thing every loop scans.

| Key | Type | Role |
| --- | --- | --- |
| `expire` | sorted set | member = `{area}:{id}`, score = unix time when `comment:{id}` expires |
| `count:{area}` | integer | live comments in that block |
| `busy` | geo set | member = `{area}`, position = center of the cell. Present only while `count:{area}` is at least 2 |
| `waiting` | set | `{user}` who is present and does not hold a token |

`comment:{id}` keeps `EX 86400`. The string can disappear on its own. `expire` is how the index hears about it without visiting every block.

## Writes

**Post.** The script already writes the comment and `area:{area}`. It also `ZADD`s `expire` at `now + 86400`, and `INCR count:{area}`. If the count is now at least 2, `GEOADD busy`. The event sent to open pages is the comment plus that count. A page with this block open appends the note. Every page updates that one cell. Nobody calls `GET /api/areas` because a comment was posted.

**Expire.** Each tick runs `ZRANGEBYSCORE expire -inf now`. For each member, `ZREM` the id from `area:{area}`, `DECR count:{area}`, and `ZREM` the member from `expire`. If the count falls below 2, `ZREM busy`. If the count is 0, `DEL count:{area}` and `DEL area:{area}`. The tick's cost is the number of comments that expired in that second. A quiet second is one range read that returns nothing. The same event shape, with the new count, tells open pages to drop the note and update the cell.

**Map.** `GEOSEARCH busy` with the viewport, expanded by `0.001°` so a cell whose center sits just outside the box is still found. Then one pipeline of `GET count:{area}` for the members Redis returned. The handler no longer calls `SMEMBERS areas` or `live_ids`.

**List.** Still `ZRANGE area:{area}` and `GET` each `comment:{id}`. That path stays O(comments in this block). A crowded block is bounded by its own notes, not by how many other blocks exist.

**Heartbeat.** Same `presence:{user}` and `active` write. If this user has no token, `SADD waiting`. If they moved off the token's block, delete the token and `SADD waiting`.

**Release.** Stale visitors come from `ZRANGEBYSCORE active -inf (now - 45)`, not from a full `ZRANGE`. Remove those members, delete their tokens, and `SREM waiting`. Grants iterate `waiting` only: `GET presence:{user}`, `SET token:{user}`, `SREM waiting`. People who already hold a token are not read.

## More than one API process

`Hub` and the comment broadcast live in the process. A second instance would grant a token into Redis and the page on the other instance would not hear it. When more than one process runs, publish the same events on a Redis channel. Each process forwards that channel to its own sockets and event streams. Presence, comments, and tokens are already in Redis, so any instance can serve a read or a post.

## Checklist

- [x] Add `expire`. The timer reads `ZRANGEBYSCORE expire -inf now` instead of every block.
- [x] Add `count:{area}` and `busy`. `GET /api/areas` uses `GEOSEARCH`. Posts no longer write `areas`.
- [x] Comment and expiry events include `area` and `count`. The page updates that cell and does not refetch `/api/areas`.
- [x] Add `waiting`. The token pass reads stale scores in `active`, then only `waiting`.
- [ ] Move the event fanout to a Redis channel when a second API process is started. `Hub` and the comment broadcast are still inside one process.

## Comparison

Take 10,000 blocks that still have comments, 1,000 people with the page open, 50 of them waiting for a token, and a second in which nothing expires. The view on screen holds 5 busy blocks.

| Work | Before | After |
| --- | --- | --- |
| Sweep, every second | `SMEMBERS areas` returns all 10,000 blocks. Each block is a `ZRANGE` plus a `GET` per comment. About 20,000 Redis commands, and the same again next second, even when nothing expired. | `ZRANGEBYSCORE expire -inf now` returns nothing. One command. |
| One map request | `SMEMBERS areas` returns all 10,000, then the process throws away every block outside the view and reads the 5 that remain. | `GEOSEARCH busy` returns those 5, then `MGET` of their counts. The other 9,995 blocks are not read. |
| One new comment, 1,000 open pages | Each page calls `GET /api/areas` again. That is 1,000 copies of the 10,000-member read. | The event carries `area` and `count`. Each page updates that one cell in memory. Redis is not read for the map. |
| Token pass, every second | `ZRANGE active` returns all 1,000 visitors. Each one who is still fresh costs an `EXISTS` on `token:{user}`. | `ZRANGEBYSCORE` returns only heartbeats older than 45 seconds. `SMEMBERS waiting` returns the 50 who still need a token. The other 950 are not read. |
| One block's list | `ZRANGE` that block and `GET` its comments. | The same. 10,000 other blocks do not change this read. |

The timer used to cost about 20,000 Redis commands a second at that size, whether or not anyone was looking. It now costs one empty range read, plus a read per visitor who went stale and a read per visitor who is still waiting. A map request used to start by loading every commented block in the world. It now loads the busy blocks inside the box on screen. A posted comment used to make every open page repeat that world read. It now updates one cell on each page.

## Still to improve

The block scan is no longer the limit. What is left is grouped by when it breaks a large crowd.

### Critical

**The host.** Vercel does not keep this process running, so the timer, the WebSocket, and the event stream stop there. Tokens are not granted and new comments are not pushed. Those three need one process that stays up. The static page can sit behind a CDN. Until that process is the public API, the indexes above do not help production.

**One process for events.** `Hub` and the comment broadcast live in this process. A second API process writes the token into Redis, and the page connected to the other process does not hear it. Publish those events on a Redis channel, and have each process forward the channel to its own sockets and streams. This is the open checklist item. It becomes necessary as soon as a second process runs.

### High

**Heartbeat writes.** Every signed-in page holds a WebSocket and writes `presence:{user}` and `active` every 15 seconds. A thousand signed-in people is a thousand sockets and about a thousand Redis writes on that cadence. Reads, posts, expiries, and the token pass share that same database. Upstash meters commands. Do not shard yet. A heartbeat that does not change the block should refresh the TTL and the `active` score and leave `waiting` alone.

**A crowded block.** The map looks up blocks inside the view. The list for one block still loads every live comment in it. A token is per person, and a person who just posted can receive another about a second later, so a thousand people in one block can add on the order of a thousand comments a second. Every open sheet for that block then receives each event. Cap how fast one block accepts posts, and page the list so an open sheet does not `GET` the whole day of notes at once.

### Medium

**The waiting set.** The token pass no longer reads people who already hold a token. It still `SMEMBERS waiting` every second. When that set is large, replace the full read with `SPOP` of a bounded batch. People who were not popped stay for the next second. A quiet second pops nothing.

**The basemap.** `tile.openstreetmap.org` is for light use. A public launch moves the basemap and keeps the same OpenStreetMap attribution. This does not change the comment loops. It is the traffic the map tiles draw once the page is public.
