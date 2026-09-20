# NEXA Leads

A private web application for a small team (up to 4 people) that researches,
verifies, organises and calls local-business leads.

The product exists to answer one question reliably: **does this business really
have no website?** Every design decision is subordinate to getting that answer
right, because a false "no website" lead wastes a call and costs credibility.

---

## What it does

1. **Research** — search a city plus a radius and a niche, and discover
   businesses through a configurable provider.
2. **Verify identity** — establish *which* business each record is, from phone,
   address, location and corroborating sources, with an explicit confidence.
3. **Deduplicate** — merge repeat records of the same business, while keeping
   genuinely separate branches separate.
4. **Verify the website** — run independent discovery channels, check every
   candidate domain against the business's own contact details, and record the
   evidence.
5. **Qualify** — decide whether a business *may* be offered as a prospect.
6. **Promote** — a person adds a business to the active lead list. Nothing is
   promoted automatically.
7. **Call** — click-to-call with attempt tracking, outcomes, callbacks and full
   per-user history. Calling never removes a lead from the list.

## Accuracy rules

These are enforced in code, documented in `docs/ARCHITECTURE.md`, and written
up for future contributors in `.claude/skills/lead-verification/SKILL.md`.

- A business is marked **Verified no website** only when its identity is
  confirmed, *every* research channel completed successfully, at least
  `MIN_CHANNELS_FOR_NO_WEBSITE` channels ran, no candidate domain reached the
  probable threshold, and the resulting confidence is ≥ 70.
- If any channel is unavailable or errors — including "no search provider is
  configured" — the result is **Requires manual check**, never "no website".
- A website that is temporarily unreachable is not a website that does not
  exist.
- A domain is never accepted on name similarity alone; acceptance needs a
  matching phone number, a matching street + postal code, or the business
  profile itself declaring the domain.
- Two businesses are never merged on a name alone.
- Unknown data stays unknown. Opening hours, addresses and phone numbers are
  never invented, and anything unparsed is shown verbatim and marked unverified.

## Statuses

| Website status | Meaning |
| --- | --- |
| `VERIFIED_WEBSITE` | A site was found carrying this business's own contact details. |
| `PROBABLE_WEBSITE` | A site probably belongs to them; not confirmed. |
| `WEBSITE_UNCERTAIN` | Pages mention them, but ownership could not be established. |
| `VERIFIED_NO_WEBSITE` | Identity confirmed, all channels ran, nothing found. **The only status that qualifies as a lead.** |
| `REQUIRES_MANUAL_CHECK` | The research was incomplete or the evidence conflicts. |
| `IDENTITY_UNVERIFIED` | Website status was not determined because we do not know who this is. |

---

## Getting started

Requirements: **Node.js 20.11+** (22 recommended). No database server needed.

```bash
git clone <this repository>
cd Local-Lead-Liste-
npm install

cp .env.example .env
# Generate a session secret and paste it into SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm run db:migrate     # creates ./data/local-lead-list.sqlite
npm run dev            # http://localhost:3000
```

Open the app and complete the **first-run setup** to create the administrator
account. For a headless install, set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` and run `npm run db:seed` instead.

Out of the box the app runs in **demo mode**: it uses a built-in offline dataset
so you can try the whole workflow with no API keys. Demo records are badged
everywhere they appear and are never presented as real research.

### Production

```bash
npm run build
npm run start
```

Run it behind a TLS-terminating reverse proxy and set `APP_URL` to the public
`https://…` URL — that switches session cookies to `Secure` and tightens the
CSRF origin check. Back up `./data/local-lead-list.sqlite` (plus the `-wal`
file) like any other database.

---

## Configuring real data sources

Every external source sits behind an interface in `src/lib/providers/` and is
selected by environment variable. **An unavailable provider makes the system
more cautious, never more confident.**

| Variable | Options | Notes |
| --- | --- | --- |
| `DISCOVERY_PROVIDER` | `overpass`, `google-places`, `fixture` | `overpass` uses OpenStreetMap (ODbL, no key, please set a descriptive `OSM_USER_AGENT`). `google-places` needs a billing-enabled `GOOGLE_MAPS_API_KEY`. |
| `GEOCODING_PROVIDER` | `nominatim`, `google`, `fixture` | Results are cached so a location is looked up once. |
| `WEB_SEARCH_PROVIDER` | `brave`, `google-cse`, `none` | **Important:** with `none`, the search channel is unavailable, so no business can ever be confirmed as having no website. They are sent to manual check instead. |
| `PHOTO_PROVIDER` | `google-places`, `none` | Photos are proxied on demand, never stored, and only shown for a place id already matched to the business. |

Adding another provider means implementing one interface from
`src/lib/providers/types.ts` and registering it in `registry.ts`. Nothing else
changes.

A provider that cannot answer must throw `ProviderError` — returning an empty
list would look like "searched, found nothing", which the engine treats as
evidence.

---

## Secrets

`.env` is gitignored and must never be committed. `.env.example` documents every
variable. API keys are only ever read on the server; the browser receives the
provider *names* and thresholds, never a key. Photos and search calls are
proxied through the app so no user's browser talks to a provider directly.

---

## Development

```bash
npm run dev         # development server
npm run typecheck   # TypeScript, strict
npm run lint        # ESLint
npm run test        # 116 unit and integration tests (Vitest)
npm run check       # all three
npm run test:e2e    # browser smoke test against a running server
```

The end-to-end smoke test drives a real browser through setup → research →
verification → promotion → calling → filtering. It needs the app running
(`npm run start`) and Playwright's Chromium available.

### Project layout

```
src/lib/providers/     external data sources behind interfaces
src/lib/discovery/     categories, radius search, research pipeline
src/lib/identity/      identity resolution and deduplication
src/lib/website/       candidate discovery, scoring, verification engine
src/lib/qualification/ what may become a lead
src/lib/repo/          typed SQLite data access
src/lib/hours/         opening-hours parsing and open/closed state
src/lib/command/       natural-language command parser (DE + EN)
src/app/               Next.js routes (App Router)
src/components/        UI
tests/                 Vitest suites
docs/ARCHITECTURE.md   architecture, data model and pipeline
```

### The command bar

The natural-language input is a deterministic parser, not a model. It handles
German and English:

- “Build me a lead list for Frankfurt”
- “Find 20 barbers around Gießen”
- “Find restaurants within 15 km of Frankfurt”
- “Show today's uncalled leads”
- “Show leads that are open right now”

It converts a sentence into the same structured request the forms produce, so it
can never bypass a verification step. When it is unsure, it says so and offers
examples rather than guessing.

---

## Security

- Passwords: scrypt (N=16384) with a per-user salt and constant-time comparison.
- Sessions: 32 bytes of randomness, stored only as a SHA-256 hash, httpOnly,
  SameSite=Lax, `Secure` when `APP_URL` is https, 14-day rolling expiry.
- Mutations validate input with zod and check the request origin (CSRF).
- Sign-in and research endpoints are rate limited per IP and per account.
- Outbound fetches of candidate websites block private addresses (SSRF), cap
  size, time and redirects, and send no credentials.
- Deactivating a user or changing a password ends that account's sessions.
- Every state change is written to an audit log with the user and a timestamp.

## Multi-user

Up to four active accounts share one research pool and one lead list. Leads can
be assigned; the calling queue puts a caller's own leads ahead of everyone
else's so two people do not work the same lead at once. Call history is
per-user, and the dashboard shows team activity.

## Known limits

- Research runs in the app's own Node process. It is designed for a single
  long-lived server, not for a serverless deployment where background work is
  cut off after the response.
- The directory channel is deliberately not implemented by scraping. It only
  activates with a provider whose terms permit it.
- There is no map view. It was scoped out in favour of the verification,
  lead-management and calling workflows; business coordinates are stored, so it
  can be added later without a data migration.
