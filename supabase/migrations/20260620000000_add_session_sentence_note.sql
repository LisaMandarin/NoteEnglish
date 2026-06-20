-- Add a user-defined free-text note per sentence
ALTER TABLE session_sentences
  ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
