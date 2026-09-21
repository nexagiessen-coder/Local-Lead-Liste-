# NEXA Leads on Hostinger's Unlimited/Business Node.js hosting

## What this is

Hostinger's **Unlimited** plan (the plan formerly branded "Business" Web
Hosting, since July 2026 sold as "Unlimited") includes a Node.js app feature in
hPanel, built on **Phusion Passenger**. This is a real, actively-managed
process — not the per-request PHP model most shared hosting uses — so it *can*
run this app. No VPS purchase needed.

**Correction to earlier guidance:** an earlier version of this deployment
guidance said the Unlimited plan could not run Node.js apps at all. That was
wrong. Passenger keeps a persistent worker process per app, and hPanel's
Node.js Selector explicitly auto-detects Next.js apps. `deploy/hostinger/`
(the VPS + Docker path) remains a better fit for high call volume or heavy
customisation; this path is for getting a working deployment with zero new
spend and no VPS.

The database is **Postgres, hosted on Supabase** (a separate free service —
see below), not a file on Hostinger's disk. This removes what used to be the
biggest source of uncertainty on shared hosting: no local database file to
place on a surviving path, and no native module (`better-sqlite3`) that had
to compile successfully against Hostinger's exact build image.

## What's known to work

- hPanel deploys directly from a GitHub repository, with automatic rebuilds
  on push.
- It auto-detects Next.js and pre-fills the build command.
- Node.js 18, 20, 22 and 24 are available — pick **20** or **22** (this app's
  `package.json` requires ≥ 20.11).
- Environment variables are set through the hPanel UI and persist across
  redeploys — no `.env` file to manage.
- Passenger sets `PORT` for the app to bind to; `next start` (this app's
  `npm start`) already honours `process.env.PORT` without extra configuration.
- The app migrates its own Postgres database on first request
  (`ensureMigrated()` in `src/lib/db/index.ts` runs automatically inside every
  query), so there is no separate migration step to run by hand.
- `pg`, the Postgres driver, is a pure-JS package with no native addon to
  compile, so there's no `better-sqlite3`-style install-failure risk.

## One-time setup: a Supabase project

1. Create a free project at [supabase.com](https://supabase.com) (no card
   required for the free tier).
2. In the new project, go to **Settings → Database → Connection string** and
   copy the **Session pooler** or **Transaction pooler** form (not "Direct
   connection" — that one is IPv6-only, and most shared hosting, Hostinger
   included, only routes IPv4 outbound). It looks like:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. That's the whole setup — no need to run migrations or create tables by
   hand; the app does that itself on first request.
4. Optional but recommended: in the Supabase SQL Editor, paste in and run
   [`src/lib/db/security/enable_rls.sql`](../../src/lib/db/security/enable_rls.sql)
   from this repository. It closes Supabase's public REST API for these
   tables — which this app never uses — without affecting the app itself;
   see the comment at the top of that file.

## What to verify once you're in hPanel (genuinely unknown from here)

Only one real unknown remains, now that the database is external:

1. **Whether Hostinger's outbound network reaches Supabase's pooler.** Shared
   hosting sometimes restricts outbound connections to specific ports. Port
   `5432` (session pooler) and `6543` (transaction pooler) should both be
   ordinary outbound TCP, but this hasn't been confirmed against Hostinger's
   exact network policy. If the app fails to start with a connection timeout
   or "ECONNREFUSED" in the Runtime Log, this is the first thing to check —
   try switching from the session pooler string to the transaction pooler
   string (or vice versa), since they're occasionally filtered differently.
2. **How Passenger handles a long research run.** Passenger can recycle an
   idle worker process. A background research run (the pipeline in
   `src/lib/discovery/pipeline.ts` continues after the HTTP response) could
   in principle be interrupted if the process is recycled mid-run. For a
   4-person team running occasional searches this is a low-probability edge
   case, not a certainty — but it's a real difference from the VPS/Docker
   path, where the process is never recycled underneath a running job. If
   research runs seem to stop partway through, this is the first thing to
   suspect. Unlike the old SQLite setup, a recycled worker can never corrupt
   or lose data — Postgres survives it — the risk is only an interrupted run
   showing as `partial` rather than `completed`, which is safe to re-run.

## Steps

1. hPanel → **Websites** (or **Node.js**, naming varies by account) →
   **Create a Node.js app**.
2. Choose **Deploy from GitHub**, connect your GitHub account, select
   `nexagiessen-coder/Local-Lead-Liste-`, branch
   `claude/local-lead-list-app-drb359`.
3. Confirm the detected framework is Next.js. Node version: **22** (or 20).
   Build command: `npm run build` (should be pre-filled). Start command:
   `npm start`.
4. Add environment variables (exact names from `.env.example`):

   | Key | Value |
   | --- | --- |
   | `SESSION_SECRET` | generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` on any machine, or ask — it's just 48 random bytes |
   | `DATABASE_URL` | the Supabase pooler connection string from the setup step above |
   | `APP_URL` | your Hostinger-assigned domain, e.g. `https://yourapp.hostingersite.com`, with `https://` |
   | `DEFAULT_COUNTRY` | `DE` |
   | `DEFAULT_TIMEZONE` | `Europe/Berlin` |
   | `DISCOVERY_PROVIDER` | `fixture` (demo data — switch this once you add real API keys) |
   | `GEOCODING_PROVIDER` | `fixture` |
   | `WEB_SEARCH_PROVIDER` | `none` |
   | `PHOTO_PROVIDER` | `none` |

5. Deploy. Open the assigned URL — the first visit shows the setup screen to
   create the administrator account.

## If it doesn't work

If the build or start fails, the Runtime Logs in hPanel's Node.js app screen
say why. The two likely causes, in order of likelihood: a connection failure
to Supabase (see point 1 above — try the other pooler string), or a missing
`SESSION_SECRET` (the app refuses to start below 32 characters, by design —
see `assertServerConfig()` in `src/lib/env.ts`).

Paste the Runtime Log error and it can be diagnosed from there.
