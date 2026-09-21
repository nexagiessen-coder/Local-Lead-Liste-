-- `users.email` is declared `UNIQUE` in 001_init.sql, which already creates an
-- implicit unique index (`users_email_key`). The explicit `idx_users_email`
-- index was redundant from the start — same columns, same uniqueness — and
-- only added upkeep cost on every insert/update with no query benefit.
DROP INDEX IF EXISTS idx_users_email;
