-- Quiz phase 2: AI comprehension questions cached per article, per-answer quiz
-- results, and per-word mastery counters (phase 3 derives levels/SRS from these).

-- Gemini-generated reading-comprehension questions, cached per session so a
-- retake never re-calls the AI. Regeneration deletes and reinserts the set.
CREATE TABLE IF NOT EXISTS quiz_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  question_index INT  NOT NULL,
  question       TEXT NOT NULL,
  options        JSONB NOT NULL,
  answer_index   INT  NOT NULL,
  explanation    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_index)
);

-- One row per answered question. session_id is kept nullable (SET NULL on
-- session delete) so phase-3 mastery/SRS derivation keeps its history even
-- after the article is gone. lemma/pos are NULL for dictation/comprehension.
CREATE TABLE IF NOT EXISTS quiz_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  session_id  UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
  quiz_type   TEXT NOT NULL,
  lemma       TEXT,
  pos         TEXT,
  correct     BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_results_user_word_idx
  ON quiz_results (user_id, lemma, pos);

-- Per-word counters keyed by (user_id, lemma, pos) — the app's vocab identity —
-- NOT by vocab_notes rows, which save_session deletes and reinserts on every
-- save. pos defaults to '' because the key must be non-null.
-- level / next_review_at are written in phase 3 (mastery levels + SRS).
CREATE TABLE IF NOT EXISTS word_mastery (
  user_id        UUID NOT NULL,
  lemma          TEXT NOT NULL,
  pos            TEXT NOT NULL DEFAULT '',
  correct_count  INT  NOT NULL DEFAULT 0,
  wrong_count    INT  NOT NULL DEFAULT 0,
  level          INT  NOT NULL DEFAULT 0,
  last_result_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, lemma, pos)
);

-- Only the backend (service role key, which bypasses RLS) touches these tables;
-- enabling RLS with no policies denies all direct anon/authenticated access.
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_mastery ENABLE ROW LEVEL SECURITY;
