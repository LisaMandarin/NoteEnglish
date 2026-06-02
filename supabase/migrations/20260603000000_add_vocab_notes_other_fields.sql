-- Add extra user-defined note fields to vocab_notes
ALTER TABLE vocab_notes
  ADD COLUMN IF NOT EXISTS other_1 TEXT,
  ADD COLUMN IF NOT EXISTS other_2 TEXT,
  ADD COLUMN IF NOT EXISTS other_3 TEXT,
  ADD COLUMN IF NOT EXISTS other_4 TEXT,
  ADD COLUMN IF NOT EXISTS other_5 TEXT;
