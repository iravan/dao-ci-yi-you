# 到此一遊

The map page. From this folder, run `bun run dev` and open http://localhost:3000.

The published page is https://iravan.github.io/dao-ci-yi-you/. Demo mode is off unless the address is `/demo` or has `?demo=1`. The published demo is https://iravan.github.io/dao-ci-yi-you/demo/.

Local comments come from the Rust service. Copy `.env.example` to `.env.local` and run the server in `../server` (`cargo run`). The page calls `NEXT_PUBLIC_API_URL`; both the page and the server use an `/api` path, so a local value is `http://127.0.0.1:8787/api`.

On Vercel the repository root deploys as one project with two services (`vercel.json`). The Rust service owns `/api`, the page owns every other path, and `NEXT_PUBLIC_API_URL` defaults to the same-origin `/api`. Set `REDIS_URL` and `CORS_ORIGINS` for the project, plus `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_DB_SCHEMA` (defaults to `dao_ci_yi_you`). The Rust service reads the JWKS address from `SUPABASE_JWKS_URL`, or derives it from the `SUPABASE_URL` the Supabase integration injects. The GitHub Pages build sets `NEXT_PUBLIC_API_URL` to empty, which keeps its server-less copy in the read-only state.

The Preview control walks the page states before sign-in and the API exist. The block size comes from the server's `GET /api/config`; a build with no API, such as the GitHub Pages demo, uses `NEXT_PUBLIC_AREA_STEP` and then `0.001`. Set it only there, and set the server's `AREA_STEP` to match. [CHECKLIST.md](CHECKLIST.md) and [../server/CHECKLIST.md](../server/CHECKLIST.md) list the implementation.

The interface is localized through `lib/i18n.ts` and `LocaleProvider`, with Traditional Chinese, Simplified Chinese, Japanese, Korean, Thai, and English. The page picks a language from `?lang=`, a saved choice, then the browser; a `select` in the account box switches it and the choice is remembered. All user-facing strings are translation keys, and the Rust API's fixed error sentences are mapped back to keys so posts can fail in the reader's language. Document metadata stays English because the site is prerendered at build time.
