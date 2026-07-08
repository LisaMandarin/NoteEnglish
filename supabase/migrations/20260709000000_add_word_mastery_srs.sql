-- Quiz phase 3: spaced-repetition state on word_mastery.
-- review_interval_days is the ladder position (0 = unreviewed/reset; the next
-- correct answer schedules 1 → 3 → 7 → 14 days; a wrong answer resets to 0
-- with next_review_at = tomorrow).
ALTER TABLE word_mastery
  ADD COLUMN IF NOT EXISTS review_interval_days INT NOT NULL DEFAULT 0;

-- "Due today" lookups filter by user and next_review_at.
CREATE INDEX IF NOT EXISTS word_mastery_due_idx
  ON word_mastery (user_id, next_review_at);
