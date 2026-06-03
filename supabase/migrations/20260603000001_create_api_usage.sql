-- Track Gemini API token consumption per user per request.
CREATE TABLE api_usage (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  endpoint        text        NOT NULL,
  model           text        NOT NULL,
  prompt_tokens   integer     NOT NULL DEFAULT 0,
  response_tokens integer     NOT NULL DEFAULT 0,
  total_tokens    integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage; backend writes via service role (bypasses RLS).
CREATE POLICY "users_own_usage" ON api_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins (app_metadata.role = 'admin') can do full CRUD.
CREATE POLICY "admins_full_access" ON api_usage
  FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');
