-- Row Level Security hardening for a Supabase project — NOT part of the
-- app's automatic migration runner (src/lib/db/migrations/), and not applied
-- by `npm run db:migrate` or on first request.
--
-- Why it lives here instead: `ENABLE ROW LEVEL SECURITY` is Postgres syntax
-- that pg-mem (the in-memory database the test suite runs against — see
-- tests/helpers.ts) cannot parse at all, so it can't sit in the scanned
-- migrations directory without breaking every test. It's also meaningless
-- outside Supabase: it only matters for Supabase's REST API (PostgREST),
-- which exposes tables to the public `anon`/`authenticated` roles whenever
-- RLS is off. A plain self-hosted Postgres has no such API, so there's
-- nothing for this to protect against there.
--
-- The app itself is completely unaffected either way: it connects with a
-- Postgres connection string authenticated as the `postgres` role, which
-- carries BYPASSRLS and ignores RLS entirely. With RLS on and zero
-- policies, `anon`/`authenticated` get a default-deny on every table — an
-- API surface the app never uses regardless.
--
-- How to apply: paste this into your Supabase project's SQL Editor and run
-- it once, or run each statement through the Supabase MCP's apply_migration
-- tool / the Supabase CLI. Safe to run again — ENABLE ROW LEVEL SECURITY is
-- idempotent.
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."website_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."website_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lead_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lead_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."call_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."research_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."research_run_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."geocode_cache" ENABLE ROW LEVEL SECURITY;
-- Created by runMigrations() itself (CREATE TABLE IF NOT EXISTS), so it
-- exists by the time you run this, but isn't in a migration file of its own.
ALTER TABLE "public"."schema_migrations" ENABLE ROW LEVEL SECURITY;
