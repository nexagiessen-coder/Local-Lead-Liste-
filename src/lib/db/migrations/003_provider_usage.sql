-- Tracks external API usage per calendar month (UTC), so an optional cap —
-- e.g. to stay inside a provider's free tier — can be enforced reliably
-- across process restarts, not just with an in-memory counter that would
-- reset every time the app redeploys or the host recycles the process.
CREATE TABLE provider_usage (
  provider   TEXT NOT NULL,
  period     TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (provider, period)
);
