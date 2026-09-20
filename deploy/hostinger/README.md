# NEXA Leads on Hostinger

## Which Hostinger plan

**A VPS.** Not shared, not Business, not Cloud hosting.

Hostinger's shared plans do list a Node.js option, but they are built around PHP
and a web server that starts a process per request. NEXA Leads needs the
opposite: one process that stays alive between requests (a research run keeps
working after the page has responded) and a database file on a disk that
survives restarts. On a shared plan you would get an app that starts, then loses
your leads.

Any VPS plan works — the app and its database are small. Pick an **Ubuntu**
template in hPanel; the setup script installs everything else.

## One-command install

SSH in as root, then:

```bash
curl -fsSL https://raw.githubusercontent.com/nexagiessen-coder/Local-Lead-Liste-/claude/local-lead-list-app-drb359/deploy/hostinger/setup.sh -o setup.sh
less setup.sh                                   # read it before you run it
bash setup.sh leads.example.com you@example.com
```

Point the domain's **A record at your VPS IP first** — in hPanel under
*Domains → DNS Zone* if the domain is with Hostinger. Certificates are issued on
the first request, so DNS has to resolve before that.

The script:

1. installs Docker from Docker's own apt repository,
2. opens only SSH, 80 and 443 in the firewall,
3. clones the repository to `/opt/nexa-leads`,
4. generates a session secret and writes `deploy/hostinger/.env` (mode 600),
5. builds the image and starts the app behind Caddy, which gets and renews the
   TLS certificate automatically,
6. waits until the app reports healthy, then prints the URL.

Running it again is safe: it keeps the existing session secret (regenerating one
would sign everyone out) and never touches the database volume.

## What you get

```
internet ──► Caddy (80/443, TLS)  ──►  app (3000, not published)
                                        └── /app/data  ──► docker volume
```

The app is not reachable on the host at all; the only way in is HTTPS on your
domain.

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

Backups use SQLite's own online backup, so they are safe to take while people
are calling. They land in `/opt/nexa-leads-backups` and the last 14 are kept.

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

**You need to start over without losing data.** The database lives in the
`hostinger_leads-data` volume, independent of the containers:

```bash
docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml down
docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml up -d --build
```

`docker compose down -v` **would** delete it. Take a backup first if you ever
need that.
