-- NEXA Leads — initial schema (PostgreSQL / Supabase dialect).
--
-- Translated from the original SQLite schema. All timestamps are unix epoch
-- milliseconds (UTC), stored as BIGINT — SQLite's INTEGER silently holds a
-- 64-bit value, but Postgres's INTEGER is 32-bit and would overflow a
-- 13-digit millisecond timestamp (current values are already ~1.79e12).
-- Every other INTEGER column (scores, counts, 0/1 flags, pixel dimensions,
-- HTTP status codes) stays within 32-bit range and is left as INTEGER.
--
-- Boolean flags (is_active, is_demo_data, is_terminal, is_callable, …) are
-- kept as INTEGER 0/1 rather than native BOOLEAN, so the application code's
-- `=== 1` / `? 1 : 0` comparisons work unchanged.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL,
  last_login_at  BIGINT
);
CREATE UNIQUE INDEX idx_users_email ON users (email);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,              -- sha256 hash of the session token
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   BIGINT NOT NULL,
  expires_at   BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  user_agent   TEXT,
  ip           TEXT
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Canonical business identity: one row per real-world business location.
CREATE TABLE businesses (
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  name_normalized           TEXT NOT NULL,
  category                  TEXT,
  category_label            TEXT,
  street                    TEXT,
  house_number              TEXT,
  postal_code               TEXT,
  city                      TEXT,
  city_normalized           TEXT,
  region                    TEXT,
  country_code              TEXT,
  lat                       DOUBLE PRECISION,
  lon                       DOUBLE PRECISION,
  phone_raw                 TEXT,
  phone_e164                TEXT,
  email                     TEXT,
  timezone                  TEXT,
  opening_hours_json        TEXT,
  opening_hours_source      TEXT,
  opening_hours_verified_at BIGINT,
  identity_status           TEXT NOT NULL DEFAULT 'UNVERIFIED'
                              CHECK (identity_status IN ('CONFIRMED','PROBABLE','UNVERIFIED','NEEDS_REVIEW')),
  identity_confidence       INTEGER NOT NULL DEFAULT 0,
  identity_signals_json     TEXT,
  website_status            TEXT NOT NULL DEFAULT 'NOT_CHECKED'
                              CHECK (website_status IN (
                                'NOT_CHECKED','VERIFIED_WEBSITE','PROBABLE_WEBSITE',
                                'WEBSITE_UNCERTAIN','VERIFIED_NO_WEBSITE','REQUIRES_MANUAL_CHECK',
                                'IDENTITY_UNVERIFIED')),
  website_confidence        INTEGER,
  website_url               TEXT,
  website_checked_at        BIGINT,
  branch_group_key          TEXT,
  dedupe_key_phone          TEXT,
  dedupe_key_address        TEXT,
  is_demo_data              INTEGER NOT NULL DEFAULT 0,
  first_seen_at             BIGINT NOT NULL,
  last_seen_at              BIGINT NOT NULL,
  discovered_in_run         TEXT,
  excluded_at               BIGINT,
  excluded_by               TEXT REFERENCES users (id) ON DELETE SET NULL,
  exclusion_reason          TEXT,
  created_at                BIGINT NOT NULL,
  updated_at                BIGINT NOT NULL
);
CREATE INDEX idx_businesses_phone ON businesses (dedupe_key_phone);
CREATE INDEX idx_businesses_address ON businesses (dedupe_key_address);
CREATE INDEX idx_businesses_city ON businesses (city_normalized);
CREATE INDEX idx_businesses_name ON businesses (name_normalized);
CREATE INDEX idx_businesses_geo ON businesses (lat, lon);
CREATE INDEX idx_businesses_website_status ON businesses (website_status);
CREATE INDEX idx_businesses_category ON businesses (category);

-- Every provider record that contributed to a business.
CREATE TABLE business_sources (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  source_url   TEXT,
  raw_json     TEXT,
  fetched_at   BIGINT NOT NULL,
  UNIQUE (provider, external_id)
);
CREATE INDEX idx_business_sources_business ON business_sources (business_id);

-- Photo references only (URL + attribution). Binaries are never stored.
CREATE TABLE business_photos (
  id                   TEXT PRIMARY KEY,
  business_id          TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  provider_ref         TEXT NOT NULL,
  attribution          TEXT,
  width                INTEGER,
  height               INTEGER,
  link_basis           TEXT NOT NULL,   -- how we know the photo belongs to this business
  fetched_at           BIGINT NOT NULL,
  UNIQUE (business_id, provider, provider_ref)
);

-- One row per website verification run.
CREATE TABLE website_verifications (
  id             TEXT PRIMARY KEY,
  business_id    TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  confidence     INTEGER NOT NULL,
  accepted_url   TEXT,
  channels_json  TEXT NOT NULL,       -- per-channel status: ok | unavailable | error
  summary        TEXT,
  engine_version TEXT NOT NULL,
  triggered_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  run_id         TEXT,
  started_at     BIGINT NOT NULL,
  finished_at    BIGINT NOT NULL
);
CREATE INDEX idx_verifications_business ON website_verifications (business_id, finished_at DESC);

-- Every domain considered during verification, with its decision.
CREATE TABLE website_candidates (
  id              TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL REFERENCES website_verifications (id) ON DELETE CASCADE,
  business_id     TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  final_url       TEXT,
  domain          TEXT NOT NULL,
  source_channel  TEXT NOT NULL,
  score           INTEGER NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('ACCEPTED','PROBABLE','REJECTED','UNREACHABLE')),
  decision_reason TEXT NOT NULL,
  signals_json    TEXT,
  http_status     INTEGER,
  fetched_at      BIGINT
);
CREATE INDEX idx_candidates_verification ON website_candidates (verification_id);

-- Atomic, human-readable evidence items.
CREATE TABLE verification_evidence (
  -- Insertion order within one verification run: every item in a run shares
  -- the same created_at millisecond, so this (not created_at, not the
  -- random id) is what preserves display order.
  seq             BIGSERIAL,
  id              TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL REFERENCES website_verifications (id) ON DELETE CASCADE,
  business_id     TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  statement       TEXT NOT NULL,
  detail          TEXT,
  source_label    TEXT,
  source_url      TEXT,
  stance          TEXT NOT NULL CHECK (stance IN ('supports','contradicts','neutral')),
  created_at      BIGINT NOT NULL
);
CREATE INDEX idx_evidence_verification ON verification_evidence (verification_id);
CREATE INDEX idx_evidence_business ON verification_evidence (business_id);

-- Configurable lead statuses.
CREATE TABLE lead_statuses (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  tone        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  is_terminal INTEGER NOT NULL DEFAULT 0,
  is_callable INTEGER NOT NULL DEFAULT 1
);

-- A business promoted into the active lead list (always a human decision).
CREATE TABLE leads (
  id                 TEXT PRIMARY KEY,
  business_id        TEXT NOT NULL UNIQUE REFERENCES businesses (id) ON DELETE CASCADE,
  status             TEXT NOT NULL REFERENCES lead_statuses (key),
  assigned_user_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  priority           INTEGER NOT NULL DEFAULT 0,
  qualification_json TEXT,
  call_count         INTEGER NOT NULL DEFAULT 0,
  last_call_at       BIGINT,
  last_call_by       TEXT REFERENCES users (id) ON DELETE SET NULL,
  next_callback_at   BIGINT,
  locked_by          TEXT REFERENCES users (id) ON DELETE SET NULL,
  locked_at          BIGINT,
  created_by         TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);
CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_leads_assigned ON leads (assigned_user_id);
CREATE INDEX idx_leads_callback ON leads (next_callback_at);

CREATE TABLE lead_status_history (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  note        TEXT,
  created_at  BIGINT NOT NULL
);
CREATE INDEX idx_lead_history_lead ON lead_status_history (lead_id, created_at DESC);

CREATE TABLE call_attempts (
  id               TEXT PRIMARY KEY,
  lead_id          TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  business_id      TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  phone_e164       TEXT,
  started_at       BIGINT NOT NULL,
  outcome          TEXT,
  note             TEXT,
  callback_at      BIGINT,
  duration_seconds INTEGER,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX idx_calls_lead ON call_attempts (lead_id, started_at DESC);
CREATE INDEX idx_calls_user ON call_attempts (user_id, started_at DESC);

CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  lead_id     TEXT REFERENCES leads (id) ON DELETE SET NULL,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX idx_notes_business ON notes (business_id, created_at DESC);

CREATE TABLE research_runs (
  id              TEXT PRIMARY KEY,
  created_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
  query_text      TEXT,
  location_label  TEXT NOT NULL,
  center_lat      DOUBLE PRECISION,
  center_lon      DOUBLE PRECISION,
  radius_km       DOUBLE PRECISION NOT NULL,
  category        TEXT,
  requested_count INTEGER NOT NULL,
  provider        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('running','completed','failed','partial')),
  stats_json      TEXT,
  error           TEXT,
  started_at      BIGINT NOT NULL,
  finished_at     BIGINT
);
CREATE INDEX idx_runs_started ON research_runs (started_at DESC);

CREATE TABLE research_run_items (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES research_runs (id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses (id) ON DELETE SET NULL,
  raw_name    TEXT NOT NULL,
  outcome     TEXT NOT NULL,      -- new | duplicate | refreshed | excluded | needs_review | rejected
  reason      TEXT,
  created_at  BIGINT NOT NULL
);
CREATE INDEX idx_run_items_run ON research_run_items (run_id);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  detail_json TEXT,
  created_at  BIGINT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Cached geocoding results, so the same location is not looked up twice.
CREATE TABLE geocode_cache (
  query       TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);

INSERT INTO lead_statuses (key, label, tone, sort_order, is_active, is_terminal, is_callable) VALUES
  ('new',              'New',                'neutral', 10, 1, 0, 1),
  ('ready_to_call',    'Ready to Call',      'info',    20, 1, 0, 1),
  ('called',           'Called',             'neutral', 30, 1, 0, 1),
  ('no_answer',        'No Answer',          'warn',    40, 1, 0, 1),
  ('callback',         'Callback',           'info',    50, 1, 0, 1),
  ('interested',       'Interested',         'good',    60, 1, 0, 1),
  ('not_interested',   'Not Interested',     'bad',     70, 1, 1, 0),
  ('wrong_number',     'Wrong Number',       'bad',     80, 1, 1, 0),
  ('already_has_site', 'Already Has Website','bad',     90, 1, 1, 0),
  ('not_a_fit',        'Not a Fit',          'bad',    100, 1, 1, 0),
  ('converted',        'Converted',          'good',   110, 1, 1, 0),
  ('do_not_contact',   'Do Not Contact',     'bad',    120, 1, 1, 0);
