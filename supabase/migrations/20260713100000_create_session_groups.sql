-- Topic folders: users organize study sessions into named groups (e.g. a book
-- or a theme). A session belongs to at most one group; group_id NULL means
-- ungrouped. Deleting a group releases its sessions back to ungrouped
-- (ON DELETE SET NULL) rather than deleting them.

CREATE TABLE IF NOT EXISTS session_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  name       TEXT NOT NULL,
  -- Manual ordering hint for future drag-to-reorder; listing falls back to
  -- created_at when sort_order ties.
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listing a user's groups is the only read path.
CREATE INDEX IF NOT EXISTS session_groups_user_idx
  ON session_groups (user_id);

-- NULL = ungrouped. ON DELETE SET NULL: removing a folder keeps its sessions.
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS group_id UUID
  REFERENCES session_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- Filtering / counting sessions within a group.
CREATE INDEX IF NOT EXISTS study_sessions_group_idx
  ON study_sessions (group_id);

-- Only the backend (service role key, which bypasses RLS) touches this table;
-- enabling RLS with no policies denies all direct anon/authenticated access.
ALTER TABLE session_groups ENABLE ROW LEVEL SECURITY;
