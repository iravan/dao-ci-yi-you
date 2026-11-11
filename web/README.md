# 到此一遊

The map page. From this folder, run `bun run dev` and open http://localhost:3000.

The published page is https://iravan.github.io/dao-ci-yi-you/. Demo mode is off unless the address is `/demo` or has `?demo=1`. The published demo is https://iravan.github.io/dao-ci-yi-you/demo/.

Local comments come from the Rust service. Copy `.env.example` to `.env.local` and run the server in `../server` (`cargo run`). The page calls `NEXT_PUBLIC_API_URL`, which defaults to nothing until that file is set.

The Preview control walks the page states before sign-in and the API exist. Implementation lists: [CHECKLIST.md](CHECKLIST.md) and [../server/CHECKLIST.md](../server/CHECKLIST.md).
