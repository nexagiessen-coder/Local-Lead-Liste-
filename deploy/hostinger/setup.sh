#!/usr/bin/env bash
#
# NEXA Leads — first-time setup on a fresh Hostinger VPS (Ubuntu).
#
#   ssh root@<your-vps-ip>
#   curl -fsSL https://raw.githubusercontent.com/nexagiessen-coder/Local-Lead-Liste-/claude/local-lead-list-app-drb359/deploy/hostinger/setup.sh -o setup.sh
#   less setup.sh          # read it before running it
#   bash setup.sh leads.example.com you@example.com 'postgresql://postgres.xxx:pw@aws-0-region.pooler.supabase.com:5432/postgres'
#
# The third argument is a Postgres connection string from a Supabase project
# (Settings -> Database -> Connection string; use the "Session pooler" or
# "Transaction pooler" form, not "Direct connection"). Create a free project
# at supabase.com first if you don't have one — this script doesn't do that
# part for you, since it needs your Supabase account.
#
# Safe to run again: it never overwrites an existing session secret. Omit the
# database URL on a re-run to keep the one already configured.

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
DATABASE_URL_ARG="${3:-}"
BRANCH="${BRANCH:-claude/local-lead-list-app-drb359}"
REPO="${REPO:-https://github.com/nexagiessen-coder/Local-Lead-Liste-.git}"
APP_DIR="${APP_DIR:-/opt/nexa-leads}"

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[1;31mxx\033[0m %s\n\n' "$1" >&2; exit 1; }

# --- Checks ------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "Run this as root (Hostinger gives you root on a VPS)."

if [ -z "$DOMAIN" ]; then
  cat >&2 <<'USAGE'
Usage: bash setup.sh <domain> [email] [database-url]

  <domain>       The hostname people will open, e.g. leads.example.com
                 Point its DNS A record at this VPS's IP first, or the
                 certificate cannot be issued.
  [email]        Optional. Let's Encrypt uses it for expiry warnings.
  [database-url] A Postgres connection string from Supabase (Settings ->
                 Database -> Connection string; use the pooler form).
                 Required on the first run; omit on later runs to keep the
                 one already configured.

Running without a domain is not supported: session cookies are only sent over
HTTPS in production, so the app needs a real hostname.
USAGE
  exit 1
fi

command -v apt-get >/dev/null 2>&1 || die "This script expects Ubuntu or Debian. Pick an Ubuntu template in hPanel."

# --- DNS sanity check --------------------------------------------------------
say "Checking that $DOMAIN points at this server"
SERVER_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  warn "$DOMAIN resolves to $DOMAIN_IP but this server is $SERVER_IP."
  warn "Certificate issuance will fail until the DNS A record points here."
  warn "Continuing anyway — Caddy retries automatically once DNS catches up."
elif [ -z "$DOMAIN_IP" ]; then
  warn "$DOMAIN does not resolve yet. Add an A record pointing at ${SERVER_IP:-this server}."
fi

# --- Docker ------------------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  say "Docker is already installed"
else
  say "Installing Docker from the official repository"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git ufw >/dev/null

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
fi

# --- Firewall ----------------------------------------------------------------
say "Opening only SSH, HTTP and HTTPS"
apt-get install -y -qq ufw >/dev/null 2>&1 || true
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw allow 443/udp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || warn "Could not enable ufw; check your firewall by hand."

# --- Source ------------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  say "Updating the existing checkout in $APP_DIR"
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  say "Cloning into $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# --- Configuration -----------------------------------------------------------
ENV_FILE="$APP_DIR/deploy/hostinger/.env"
if [ -f "$ENV_FILE" ] && grep -q '^SESSION_SECRET=.\+' "$ENV_FILE"; then
  say "Keeping the existing session secret (changing it would sign everyone out)"
  # Refresh only the values that are safe to change between runs.
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" "$ENV_FILE"
  grep -q '^CADDY_EMAIL=' "$ENV_FILE" \
    && sed -i "s|^CADDY_EMAIL=.*|CADDY_EMAIL=$EMAIL|" "$ENV_FILE" \
    || echo "CADDY_EMAIL=$EMAIL" >> "$ENV_FILE"
  if [ -n "$DATABASE_URL_ARG" ]; then
    say "Updating the database connection string"
    grep -q '^DATABASE_URL=' "$ENV_FILE" \
      && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL_ARG|" "$ENV_FILE" \
      || echo "DATABASE_URL=$DATABASE_URL_ARG" >> "$ENV_FILE"
  elif ! grep -q '^DATABASE_URL=.\+' "$ENV_FILE"; then
    die "No DATABASE_URL is configured yet. Re-run with a Supabase connection string as the third argument."
  fi
else
  [ -n "$DATABASE_URL_ARG" ] || die "A database URL is required on the first run. See the usage message above."
  say "Generating a session secret and writing $ENV_FILE"
  SECRET="$(openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_' | tr -d '=')"
  cat > "$ENV_FILE" <<ENVEOF
# Written by deploy/hostinger/setup.sh. Keep this file private.
DOMAIN=$DOMAIN
CADDY_EMAIL=$EMAIL
SESSION_SECRET=$SECRET
DATABASE_URL=$DATABASE_URL_ARG

DEFAULT_COUNTRY=DE
DEFAULT_TIMEZONE=Europe/Berlin

# Start on the built-in demo dataset. Switch these on once you have API keys —
# see "Switching on real research" in the README.
DISCOVERY_PROVIDER=fixture
GEOCODING_PROVIDER=fixture
WEB_SEARCH_PROVIDER=none
PHOTO_PROVIDER=none

OSM_USER_AGENT=NexaLeads/1.0 ($DOMAIN)
GOOGLE_MAPS_API_KEY=
BRAVE_SEARCH_API_KEY=
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_ENGINE_ID=
ENVEOF
  chmod 600 "$ENV_FILE"
fi

# --- Build and run -----------------------------------------------------------
say "Building the image and starting the stack (first build takes a few minutes)"
docker compose --env-file "$ENV_FILE" -f deploy/hostinger/docker-compose.yml up -d --build

say "Waiting for the app to answer"
for _ in $(seq 1 60); do
  if docker compose --env-file "$ENV_FILE" -f deploy/hostinger/docker-compose.yml \
      exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "${HEALTHY:-0}" = "1" ]; then
  cat <<DONE

  NEXA Leads is running.

    Open      https://$DOMAIN
    Then      create the administrator account on the setup screen
    Team      Settings -> Team, up to four seats

  Certificates are issued on the first request to your domain. If the browser
  warns about the certificate, give it a minute and reload — Caddy retries.

  Useful commands, from $APP_DIR:

    docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml logs -f app
    bash deploy/hostinger/update.sh          # pull and redeploy
    bash deploy/hostinger/backup.sh          # write a database backup

DONE
else
  warn "The app did not report healthy in time. Check the logs:"
  echo "  cd $APP_DIR && docker compose --env-file deploy/hostinger/.env -f deploy/hostinger/docker-compose.yml logs app"
  exit 1
fi
