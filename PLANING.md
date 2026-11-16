# Hosting plan

Where the page and the comment service run, and what is still open. The build spec is [TECHNICAL.md](TECHNICAL.md).

## Now

One Vercel project, two services, from [vercel.json](vercel.json):

| Service | Root | Runtime | Public path |
| --- | --- | --- | --- |
| `web` | `web` | Next.js static export | `/(.*)` |
| `server` | `server` | Rust | `/api/(.*)` |

The page is at https://dao-ci-yi-you.vercel.app. Reads work: `GET /api/areas` and `GET /api/areas/{area}/comments` both answer, and `POST` without a token answers `401`. Redis is Upstash through the Vercel Marketplace, `rediss://`, and Supabase is connected through the Marketplace too.

## What Vercel cannot do

Sign-in works. Holding a token does not. `POST /api/areas/{area}/comments` needs `token:{user}` in Redis, and that key is written only by `Store::release` (`server/src/store.rs`), which is driven by the 60-second loop in `server/src/lib.rs` and delivers its result through the in-process `Hub` over `/api/ws`.

| Piece | On Vercel | Why |
| --- | --- | --- |
| Sign-in, Supabase JWT | works | plain HTTP and JWKS |
| Presence heartbeat | no | sent over the socket every 15 seconds |
| `active` membership | no | depends on that heartbeat |
| 1-in-4 token draw | no | the timer lives in a process that does not persist |
| `token:{user}` | never written | only `release` writes it |
| Token delivery | no | `Hub` is in memory, and the upgrade times out |

Measured: a real WebSocket upgrade to `/api/ws` times out with no `101`. A production build takes 4 to 6 minutes, and every deploy recompiles cargo from scratch.

The state itself is fine. `presence:{user}`, `active`, and `token:{user}` all live in Upstash, so every instance sees the same thing. Only the process lifetime and the push transport are missing.

## What a host must provide

1. A process that stays up, so the 60-second sweep and draw keep running.
2. WebSocket passthrough with no idle timeout under about 20 seconds. The page sends a heartbeat every 15.
3. Outbound TLS for `rediss://`. Already in `server/Cargo.toml`.
4. A container or a binary. [server/Dockerfile](server/Dockerfile) is ready.
5. A region near the users. Requests have been served from `hkg1`.

## Options

| Host | WebSocket | Always on | Runs the image | Rough cost | Notes |
| --- | --- | --- | --- | --- | --- |
| Fly.io | yes | yes, once machines stop scaling to zero | yes | $2 to $5 a month | Set `min_machines_running = 1` and `auto_stop_machines = false`. Region `hkg` or `sin`. |
| Railway | yes | yes | yes | $5 a month | Deploy from the repository or the Dockerfile. Least configuration. |
| Render | yes | paid only | yes | $7 a month | The free web service spins down after about 15 idle minutes, which stops the timer. |
| VPS and Docker | yes | yes | yes | €4 to €6 a month | Cheapest at scale. You own TLS, restarts, and monitoring. |
| Google Cloud Run | yes, with tuning | no by default | yes | usage | The default request timeout of 300 seconds kills sockets. Needs `--min-instances=1` and always-allocated CPU. |
| Azure Container Apps | yes | `minReplicas: 1` | yes | usage | Same shape as Cloud Run. |
| Cloudflare Workers | yes, with Durable Objects | yes | no | low | Would mean porting Axum to wasm and Redis to the Upstash REST API. |
| Vercel, Netlify | no | no | no | none | The limits above. |

## Recommendation

Fly.io. It takes the Dockerfile as it is, two lines of `fly.toml` keep the process alive, `hkg` sits next to the users, and the deploy job is one command with `FLY_API_TOKEN` as the only secret. Railway is the alternative when nobody wants to think about machines.

The image is already built and tested by [server.yml](.github/workflows/server.yml): `cargo fmt --check` and `cargo test` against a Redis service, then a Docker build with the layer cache in GitHub Actions. The deploy step is the only part left, and every host needs `REDIS_URL`, `CORS_ORIGINS`, and `SUPABASE_URL` (or `SUPABASE_JWKS_URL`).

## The move

1. Add the host configuration and the deploy job to `server.yml`.
2. In `vercel.json`, drop the `server` service and the `/api/(.*)` rewrite. Keep `web`.
3. Set `NEXT_PUBLIC_API_URL=https://<api-host>/api` for the page and `CORS_ORIGINS=https://dao-ci-yi-you.vercel.app` for the API. The routes keep their `/api` prefix, so the value ends in `/api`.
4. Redeploy. Vercel then builds only the static page, and no Rust build minutes are spent.
5. Verify `GET /api/areas` through the new host, then a real `wss://<api-host>/api/ws` upgrade, then `POST` with a signed-in token.

## The other way

Keep Vercel and drop the socket for request and response:

- `POST /api/presence`: the 15-second heartbeat becomes an HTTP call that writes `presence:{user}` and `active`. `Store::heartbeat` already does the work.
- `GET /api/token`: lazily runs the draw for this user and returns the token. Any instance can answer, because the state is in Redis.
- The page polls every 15 seconds while visible.
- A Vercel cron hits an endpoint once a minute for the sweep and the stale `active` cleanup, replacing the in-process timer.

Cost: the token arrives up to one poll late, the arrival animation loses its push, and there are more requests. This changes the transport documented in [TECHNICAL.md](TECHNICAL.md), so that section would need to change with it.

## Open

- Apple, Google, and Facebook are still disabled at Supabase, so sign-in answers `provider is not enabled`. The page and the API are wired for it.
- `service_role`, the JWT secret, and the database password were handled outside their boundary during setup. Rotating them in Supabase is the safe move. Nothing in this repository uses them.
- The API stays read-only until either this plan's move or its alternative is done.
