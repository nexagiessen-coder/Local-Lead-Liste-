# NEXA Leads on Hostinger

## Which Hostinger plan

A VPS, if you want full control over the process (Docker, Caddy, your own
TLS). If you'd rather not manage a server at all, `deploy/hostinger-shared/`
covers running this on Hostinger's **Unlimited** plan instead — no VPS, no
new spend, using hPanel's built-in Node.js hosting. Read that first if you
already have an Unlimited/Business plan; come back here only if you want the
VPS/Docker setup specifically.

The database is Postgres, hosted on Supabase (see below) — not a file on
this VPS — so either path works from a data-durability standpoint. What a
VPS still buys you over shared hosting is a process that's guaranteed never
to be recycled mid-run, and full control over the stack.

Any VPS plan works — the app itself is small. Pick an **Ubuntu** template in
hPanel; the setup script installs everything else.

## One-time setup: a Supabase project

1. Create a free project at [supabase.com](https://supabase.com) (no card
   required for the free tier).
2. In the new project, go to **Settings → Database → Connection string** and
   copy the **Session pooler** or **Transaction pooler** form (not "Direct
   connection" — that one is IPv6-only, and not every VPS network routes
   IPv6 by default). It looks like:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. That's the whole setup — no need to run migrations or create tables by
   hand; the app does that itself on first request.
4. Optional but recommended: in the Supabase SQL Editor, paste in and run
   [`src/lib/db/security/enable_rls.sql`](../../src/lib/db/security/enable_rls.sql)
   from this repository. It closes Supabase's public REST API for these
   tables — which this app never uses — without affecting the app itself;
   see the comment at the top of that file.

## One-command install

SSH in as root, then:

```bash
curl -fsSL https://raw.githubusercontent.com/nexagiessen-coder/Local-Lead-Liste-/claude/local-lead-list-app-drb359/deploy/hostinger/setup.sh -o setup.sh
less setup.sh                                   # read it before you run it
bash setup.sh leads.example.com you@example.com 'postgresql://postgres.xxx:pw@aws-0-region.pooler.supabase.com:5432/postgres'
```

Point the domain's **A record at your VPS IP first** — in hPanel under
*Domains → DNS Zone* if the domain is with Hostinger. Certificates are issued on
the first request, so DNS has to resolve before that.

The script:

1. installs Docker from Docker's own apt repository,
2. opens only SSH, 80 and 443 in the firewall,
3. clones the repository to `/opt/nexa-leads`,
4. generates a session secret and writes `deploy/hostinger/.env` (mode 600),
   including the Supabase `DATABASE_URL` you passed in,
5. builds the image and starts the app behind Caddy, which gets and renews the
   TLS certificate automatically,
6. waits until the app reports healthy, then prints the URL.

Running it again is safe: it keeps the existing session secret (regenerating one
would sign everyone out); omit the database URL argument to keep the one
already configured.

## What you get

```
internet ──► Caddy (80/443, TLS)  ──►  app (3000, not published)  ──► Supabase (Postgres, over the network)
```

The app is not reachable on the host at all; the only way in is HTTPS on your
domain. The database is not on this VPS at all — it's a managed Postgres
instance in Supabase, reached over an outbound connection.

## Day-to-day

All from `/opt/nexa-leads`:

```bash
# Logs
docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml logs -f app

# Deploy the latest code (takes a backup first)
bash deploy/hostinger/update.sh

# Back up the database on demand
bash deploy/hostinger/backup.sh
```

Backups run `pg_dump` against Supabase (via a throwaway `postgres:17-alpine`
container, since the app image itself carries no database client tools), so
they are safe to take while people are calling. They land in
`/opt/nexa-leads-backups` as gzipped SQL dumps and the last 14 are kept.
Supabase also keeps its own backups depending on your project's plan — check
the Supabase dashboard under Database → Backups — this script is an
independent copy you control on top of that.

For a nightly backup at 03:15:

```bash
crontab -e
# then add:
15 3 * * * cd /opt/nexa-leads && bash deploy/hostinger/backup.sh >> /var/log/nexa-backup.log 2>&1
```

Copy those files off the VPS periodically — a backup on the same disk is not a
backup.

## Changing settings

Edit `/opt/nexa-leads/deploy/hostinger/.env`, then:

```bash
cd /opt/nexa-leads
docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml up -d
```

This is where you switch off the demo dataset and add your API keys. See
*Switching on real research* in the main README.

## If something goes wrong

**The certificate does not issue.** Caddy needs the domain to resolve to this
VPS and ports 80/443 reachable. Check `getent ahosts your-domain` on the VPS and
`ufw status`, then `docker compose ... logs caddy`.

**The app will not start.** `docker compose ... logs app`. A missing
`SESSION_SECRET` is the usual cause and the error says so.

**You need to start over without losing data.** The database lives in
Supabase, entirely independent of this VPS and its containers, so tearing
down and rebuilding the app here never touches it:

```bash
docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml down
docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml up -d --build
```

Even `docker compose down -v` is safe now — there is no longer a database
volume for it to remove. To actually delete the data, you'd have to do that
in the Supabase dashboard itself.
