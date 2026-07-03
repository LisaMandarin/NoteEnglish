-- Persistent cache for AI sentence-structure analyses. Keyed by a hash of the
-- normalized sentence plus the prompt version, so a prompt/schema change bumps
-- PARSE_PROMPT_VERSION and transparently invalidates stale rows. Shared across
-- users: the same sentence always yields the same analysis, so one AI call ever.
CREATE TABLE IF NOT EXISTS sentence_parses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sentence_hash  TEXT NOT NULL,
  prompt_version INT  NOT NULL,
  model          TEXT NOT NULL,
  sentence       TEXT NOT NULL,
  structure      JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Point-lookup index (sentence_hash, prompt_version) comes for free with this
  -- constraint, so cache reads stay O(log n) as the table grows.
  UNIQUE (sentence_hash, prompt_version)
);

-- Only the backend (service role key) reads/writes this cache; the service role
-- bypasses RLS, so enabling it with no policies denies all direct anon/
-- authenticated client access while leaving the backend unaffected.
ALTER TABLE sentence_parses ENABLE ROW LEVEL SECURITY;
