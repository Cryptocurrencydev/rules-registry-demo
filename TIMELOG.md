# Timelog: rules-registry-demo

All times WAT (UTC+1), 2026-11-04.

| Phase | Start | End | Duration | Notes |
|---|---|---|---|---|
| 0. Brief, tooling check (local Postgres, gh, gitleaks, Vercel API reachable) | 21:02 | 21:03 | 1m | |
| 1. Scaffold (Next.js 16, TS, pg, Vitest; no Tailwind) | 21:03 | 21:04 | 1m | |
| 2. Schema + constraints + triggers, SQL engine functions, seed data | 21:04 | 21:06 | 2m | named FK errors raised from the trigger so a missing option reports its FK name, not a not-null error |
| 3. Vitest suite (engine/API, constraints, composition) | 21:06 | 21:07 | 1m | 37/37 on first run; fixed pg "concurrent query on one client" warning |
| 4. UI + headless browser check at 390px and 1280px | 21:07 | 21:09 | 2m | fixed radios not ticking until the server replied; sticky sentence card only ≥640px; clearer rules table |
| 5. GitHub Actions CI, README (tested its SQL examples), production build | 21:09 | 21:10 | 1m | |
| 6. Gitleaks, public repo, Vercel link + Neon (Marketplace), Neon migrations | 21:10 | 21:12 | 2m | gitleaks dir scan: 12 hits, all in gitignored `.next/` build output; git history + staged files clean |
| 7. PR #1: CI (GitHub Actions, Postgres 16) + Vercel preview, merge → production deploy | 21:12 | 21:14 | 2m | CI 37/37 in 49s job time |
| 8. Live verification | 21:14 | 21:21 | 7m | ~6 min waiting for this machine's DNS to resolve the new `*.vercel.app` name. Live check caught a race: fast successive clicks could drop an answer |
| 9. PR #2: fix rapid-click race (pending selections ref), re-verify live | 21:21 | 21:23 | 2m | CI 37/37; live rapid-click, forced 422 and real save all OK at 390px + 1280px |

**Total: 21:02 → 21:23 (21 min).** About 13 min building and testing. The rest was deploying, plus ~6 min waiting for local DNS to pick up the new domain.

Tests: 37/37 locally (~0.6s) and in GitHub Actions on both PRs (job ~48s including install, typecheck, build).
