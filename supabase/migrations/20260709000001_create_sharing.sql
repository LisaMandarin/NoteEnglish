-- Article sharing: the owner (teacher) generates an unguessable share token for
-- a study session; any signed-in user with the link gets read-only access and
-- can favorite it. Favorites are references, not copies — deleting the session
-- cascades here, so "owner deletes → favorite disappears everywhere" needs no
-- backend cleanup code. Revoking a share sets the token back to NULL: favorites
-- stay in the table but are filtered out while unshared, and reappear if the
-- owner re-shares (favorites key on session_id, not on the token).

-- NULL = not shared. UNIQUE doubles as the lookup index for GET /shared/{token}.
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT NULL;

CREATE TABLE IF NOT EXISTS shared_favorites (
  user_id    UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

-- The PK only covers user-side lookups (list my favorites); the cascade delete
-- and "who favorited this session" scan the reverse direction.
CREATE INDEX IF NOT EXISTS shared_favorites_session_idx
  ON shared_favorites (session_id);

-- Only the backend (service role key, which bypasses RLS) touches this table;
-- enabling RLS with no policies denies all direct anon/authenticated access.
ALTER TABLE shared_favorites ENABLE ROW LEVEL SECURITY;
