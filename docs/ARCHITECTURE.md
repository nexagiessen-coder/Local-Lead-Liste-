# NEXA Leads — Architecture & Implementation Plan

> Status: living document. Written before implementation, updated as the system evolves.

## 1. Product summary

A private, self-hosted web application for a team of up to 4 people that:

1. **researches** local businesses in a geographic area (city + radius + niche),
2. **verifies** who each business actually is and whether it really has a website,
3. **qualifies** a small, trustworthy subset into an **active lead list**,
4. supports **cold calling** with non-destructive call tracking and history.

The product optimises for **precision, not volume**. A smaller list of leads the
team can trust beats a large list with false "no website" entries.

## 2. Non-negotiable accuracy rules

These rules are encoded in code (`src/lib/verification/*`) and in the
project skill `.claude/skills/lead-verification/SKILL.md`:

- A business is **never** marked `VERIFIED_NO_WEBSITE` because a lookup returned
  nothing. It is only marked so when *every configured discovery channel ran
  successfully*, identity is `CONFIRMED`, and no candidate reached the probable
  threshold.
- If **any discovery channel errored, was unavailable, rate-limited or not
  configured**, the outcome is `REQUIRES_MANUAL_CHECK` — never "no website".
- Identity is verified **before** website status. Unverified identity ⇒
  `IDENTITY_UNVERIFIED`, and the business can never enter the "No website"
  prospecting list.
- Conflicting evidence never resolves to a confident answer; it downgrades the
  status and the conflict is shown in the UI.
- Nothing is invented: unknown values are `null` and render as
  "Unknown / unverified", never as a guess.

## 3. Stack decision

| Concern | Choice | Why |
| --- | --- | --- |
| App framework | **Next.js 15 (App Router) + React 19 + TypeScript** | One deployable unit for UI + API; server components keep the heavy table fast; familiar and maintainable. |
| Styling | **Tailwind CSS v4** with a small token layer | Bright, clean, spreadsheet-friendly UI without a heavy component library. |
| Database | **PostgreSQL** (hosted on Supabase) via **`pg`**, hand-written SQL | A managed Postgres instance means the app itself stays stateless and can run on ordinary shared/PaaS hosting with no local disk to back up; `pg` is a pure-JS driver, so no native build step is needed. |
| Migrations | Hand-written SQL files + a tiny runner (`scripts/migrate.ts`) | Deterministic, reviewable, no engine downloads. |
| Auth | Custom: scrypt password hashing (`node:crypto`), server-side sessions, httpOnly SameSite=Lax cookies | No third-party dependency, no secrets leaving the server, full control over 4-user invite flow. |
| Validation | **zod** | One schema definition for API input validation. |
| Phone handling | **libphonenumber-js** | E.164 normalisation is the single strongest identity/dedup signal. |
| Tests | **Vitest** | Fast, no native deps, runs the verification engine directly. |
| Map | Dependency-free SVG pin view (no tile provider, no key) | Optional per spec; must not delay or complicate the core. |

### Deliberate non-choices

- **No LLM is required to run the app.** The natural-language command bar is a
  deterministic parser (DE + EN). An LLM can never relax a verification rule.
- **No scraping of services that forbid it.** Discovery uses OpenStreetMap
  (ODbL) or the Google Places API (with the operator's own key). Candidate
  websites are fetched directly from the business's own domain, which is
  ordinary HTTP client behaviour, with robots.txt respected.

## 4. Pipeline separation (mandatory)

Each stage is a separate module with typed inputs/outputs and no knowledge of
the next stage:

```
 1. DISCOVERY            src/lib/discovery/        → RawBusinessCandidate[]
 2. IDENTITY VERIFICATION src/lib/identity/        → BusinessIdentity + confidence
 3. DEDUPLICATION        src/lib/identity/dedupe   → merge / keep-separate / block
 4. WEBSITE RESEARCH     src/lib/website/discovery → WebsiteCandidate[]
 5. WEBSITE VERIFICATION src/lib/website/verify    → status + confidence + evidence
 6. QUALIFICATION        src/lib/qualification     → qualifies? why / why not
 7. USER SELECTION       app/(app)/pool            → promote to lead (human action)
 8. CALLING              app/(app)/call            → call attempts, outcomes, history
```

Stages 1–6 run inside a **research run** (`research_runs`) and write evidence at
every step. Stage 7 is always a human decision: discovery never auto-creates
leads.

## 5. Data model

Tables (PostgreSQL, all timestamps are unix epoch ms, UTC, stored as `BIGINT`):

- `users`, `sessions` — auth, up to 4 active users, roles `admin` / `member`.
- `businesses` — canonical business identity (one row per real-world location).
- `business_sources` — every provider record that contributed to a business
  (`provider`, `external_id`, raw payload JSON, fetched_at). A business may have
  many sources; sources are never silently merged across differing identities.
- `business_photos` — provider photo *references* only (URL + attribution +
  the source that vouches for the business link). Not stored as binaries.
- `website_verifications` — one row per verification run per business:
  status, confidence, channel coverage, started/finished timestamps.
- `website_candidates` — every domain considered, its source channel, the
  match signals found, and the accept/reject decision with a reason.
- `verification_evidence` — atomic, human-readable evidence items attached to a
  verification (kind, statement, source, weight, supports/contradicts).
- `leads` — a business promoted into the active list: status, assignment,
  priority, timestamps, call counters.
- `lead_status_history` — every status transition with actor and timestamp.
- `call_attempts` — timestamp, user, outcome, note, callback date, duration.
- `notes` — free-form notes per business/lead with author.
- `research_runs` + `research_run_items` — what was searched, with which
  parameters, what each candidate's outcome was (new / duplicate / excluded).
- `audit_log` — who did what to which entity, when.

Key identity columns on `businesses`: `name`, `name_normalized`, `street`,
`house_number`, `postal_code`, `city`, `country_code`, `lat`, `lon`,
`phone_e164`, `category`, `identity_status`, `identity_confidence`,
`dedupe_key_phone`, `dedupe_key_address`, `opening_hours_json`,
`opening_hours_source`, `timezone`.

## 6. Website verification engine (the core feature)

**Input:** a business whose identity status is `CONFIRMED` (or `PROBABLE`, which
can never produce `VERIFIED_NO_WEBSITE`).

**Channels** (each independently reports `ok | unavailable | error`):

1. `provider_field` — website field from the discovery provider (OSM
   `website`/`contact:website`/`url`, Google Places `websiteUri`).
2. `search_engine` — configured web-search provider queries:
   `"name" city`, `"name" street city`, `"name" phone`.
3. `domain_guess` — deterministic domain candidates from the business name and
   city across configured TLDs, only accepted after full page-level matching.
4. `social_profile` — **active resolution** of Facebook and Instagram profiles:
   the handle becomes domain candidates, the handle is searched (which surfaces
   the "Website" field search engines index from the page), and any link-in-bio
   page the business publishes is followed. The platforms themselves are never
   fetched — their terms forbid it and their login walls would make "no website"
   indistinguishable from "blocked".
5. `directory` — directory entries (only via permitted APIs) that expose a
   website field.

**Candidate evaluation** — each candidate URL is fetched (redirects followed,
final URL recorded) and scored on independent signals:

| Signal | Weight | Notes |
| --- | --- | --- |
| Phone match (E.164) | 45 | Strongest single signal. |
| Postal code + street match | 25 | Address block extracted from page/JSON-LD. |
| City match | 10 | Weak alone. |
| Business name match (normalised token overlap) | 20 | Weak alone — legal-form and generic tokens stripped. |
| schema.org LocalBusiness match | 15 | Structured confirmation. |
| Domain contains name tokens | 8 | Supporting only; never sufficient. |
| Declared by the business (profile website field or its own link page) | 20 | Strong signal. |
| **Conflicting phone on page** | −40 | Different business. |
| **Conflicting postal code/city** | −25 | Different branch or business. |
| Parked / for-sale / placeholder page | reject | Not a website. |

A candidate is `ACCEPTED` at ≥ 70 with at least one *strong* signal
(phone or address), `PROBABLE` at ≥ 45, otherwise `REJECTED` with a reason.

**Status resolution:**

| Result | Condition |
| --- | --- |
| `VERIFIED_WEBSITE` | ≥1 accepted candidate. |
| `PROBABLE_WEBSITE` | ≥1 probable candidate, none accepted. |
| `WEBSITE_UNCERTAIN` | candidates exist but all weak/conflicting. |
| `VERIFIED_NO_WEBSITE` | identity `CONFIRMED` **and** every channel `ok` (including social resolution) **and** no candidate ≥ probable threshold **and** ≥ `MIN_CHANNELS_FOR_NO_WEBSITE` channels ran **and** confidence ≥ 70. |
| `REQUIRES_MANUAL_CHECK` | any channel not `ok`, identity not confirmed, or evidence conflicts. |

Only `VERIFIED_NO_WEBSITE` qualifies for the "no website" prospecting list.

## 7. Deduplication

Ordered rules, evaluated against existing businesses:

1. **Same phone (E.164) + compatible name** ⇒ same business.
2. **Same normalised address (postal code + street + house number)** and name
   similarity ≥ 0.6 ⇒ same business.
3. **Within 60 m** and name similarity ≥ 0.85 ⇒ same business.
4. Same name, **different address or phone** ⇒ **separate branches** (kept
   separate, cross-linked via `branch_group_key`).
5. Name similarity ≥ 0.85 but conflicting strong signals ⇒ `NEEDS_REVIEW`
   (never auto-merged).

## 8. External providers

All providers sit behind interfaces in `src/lib/providers/` and are selected by
environment variables. Every provider reports availability; an unavailable
provider degrades verification to manual-check rather than producing a
confident answer.

| Interface | Implementations |
| --- | --- |
| `GeocodingProvider` | `nominatim` (OSM), `google`, `fixture` |
| `DiscoveryProvider` | `overpass` (OSM), `google-places`, `fixture` |
| `WebSearchProvider` | `brave`, `google-cse`, `none` |
| `HttpFetcher` | real fetch with timeout/robots/redirect caps; recorded fetcher in tests |
| `PhotoProvider` | `google-places` (proxied, never persisted), `none` |

`fixture` providers ship a small, clearly-labelled demo dataset so the app is
runnable and testable with zero API keys. Demo data is flagged
(`is_demo_data = 1`) in the database and badged in the UI so it can never be
mistaken for real research.

## 9. Security

- Sessions: 32-byte random token, stored hashed (SHA-256) server-side, httpOnly
  + SameSite=Lax + Secure (when `APP_URL` is https), 14-day rolling expiry.
- Passwords: scrypt (N=16384, r=8, p=1) with per-user salt, constant-time compare.
- All mutations go through POST route handlers with an origin check (CSRF) and
  zod validation.
- Login and research endpoints are rate limited per IP and per user.
- No secrets in the repo: `.env.example` documents every variable; `.env*` is
  gitignored.
- Outbound fetches: timeout, size cap, redirect cap, private-IP blocking
  (SSRF protection), and no credential forwarding.

## 10. Build phases

1. Foundation (config, tokens, layout, navigation) ✔
2. Database + migrations + seed ✔
3. Auth ✔
4. Discovery ✔
5. Identity + dedupe ✔
6. Website verification ✔
7. Research pool + leads ✔
8. Calling ✔
9. Detail panel + hours + evidence + photos ✔
10. Dashboard + command bar ✔
11. Tests ✔
12. Final verification ✔
