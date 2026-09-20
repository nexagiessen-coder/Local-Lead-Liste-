# NEXA Leads — working notes

A private lead-research and cold-calling app for a team of up to four people.
The whole product hinges on one question being answered honestly: **does this
business really have no website?**

## Read first

- `docs/ARCHITECTURE.md` — stack, pipeline, data model, thresholds.
- `.claude/skills/lead-verification/SKILL.md` — the accuracy rules. Load this
  before touching discovery, identity, deduplication, website verification,
  qualification or evidence.

## The rules that must not be broken

1. `VERIFIED_NO_WEBSITE` requires a confirmed identity, every channel reporting
   `ok`, at least `MIN_CHANNELS_FOR_NO_WEBSITE` channels run, no probable
   candidate, and confidence ≥ 70. Anything else is a manual check.
2. A provider that cannot answer throws `ProviderError`. It never returns `[]`,
   because an empty list means "looked and found nothing" and is used as
   evidence.
3. Unknown data stays `null` and renders as "unknown". Nothing is invented —
   not hours, not addresses, not phone numbers.
4. Two businesses are never merged on name similarity alone; a shared name with
   a different address or phone is a separate branch.
5. Discovery never creates a lead. Promotion is always a human action.
6. Efficiency work may not remove a verification step.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 ·
SQLite via better-sqlite3 with hand-written SQL migrations · Vitest.
Auth is custom: scrypt passwords, server-side sessions, httpOnly cookies.

## Commands

```bash
npm run dev        # development server
npm run check      # typecheck + lint + tests
npm run test       # Vitest
npm run db:migrate # apply migrations
npm run test:e2e   # browser smoke test (needs the app running)
```

## Conventions

- Keep the pipeline stages in separate modules; providers never reach into the
  verification engine.
- Data access lives in `src/lib/repo/*` and takes an optional `db` argument so
  tests can pass an in-memory database.
- Add a test to `tests/website-verification.test.ts` for every new status path.
- Mutations go through server actions or route handlers that validate with zod
  and check the request origin.
- Demo data is flagged `is_demo_data` and badged in the UI. Never present it as
  real research.
