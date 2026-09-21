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
- The app migrates its own SQLite database on first request
  (`getDb()` in `src/lib/db/index.ts` calls `runMigrations()` automatically),
  so there is no separate migration step to run by hand.

## What to verify once you're in hPanel (genuinely unknown from here)

These depend on your specific account and can't be confirmed without access
to it:

1. **Where the SQLite file should live.** It must be a path that survives a
   redeploy (a `git pull`-style update, not a full wipe). Look at the app's
   file manager for a location outside the repository's own tracked files —
   commonly a sibling folder to the app root, e.g.
   `/home/<user>/data/nexa-leads.sqlite`. Set `DATABASE_PATH` to that
   absolute path. If unsure, ask Hostinger support "which directories survive
   a Node.js app redeploy" before your first real research run — recreating
   the database is cheap on day one, expensive after your team has called
   50 leads.
2. **Whether better-sqlite3's prebuilt binary installs cleanly.** It ships
   prebuilt binaries for standard Linux x64, which is very likely what
   Hostinger's build runs on, but this hasn't been verified against their
   exact build image. Check the build log after the first deploy; a failure
   here shows up as an install error naming `better-sqlite3`.
3. **How Passenger handles a long research run.** Passenger can recycle an
   idle worker process. A background research run (the pipeline in
   `src/lib/discovery/pipeline.ts` continues after the HTTP response) could
   in principle be interrupted if the process is recycled mid-run. For a
   4-person team running occasional searches this is a low-probability edge
   case, not a certainty — but it's a real difference from the VPS/Docker
   path, where the process is never recycled underneath a running job. If
   research runs seem to stop partway through, this is the first thing to
   suspect.

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
   | `DATABASE_PATH` | an absolute path outside the repo that survives redeploys — see above |
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
say why. The three likely causes, in order of likelihood: a missing/incorrect
`DATABASE_PATH` (the app can't write the database file — check the directory
exists and is writable), a `better-sqlite3` install failure (see point 2
above), or a missing `SESSION_SECRET` (the app refuses to start below 32
characters, by design — see `assertServerConfig()` in `src/lib/env.ts`).

Paste the Runtime Log error and it can be diagnosed from there.
