-- Traditional Chinese translation of the vocab example sentence.
-- Nullable: rows saved before this feature simply have no translation until
-- the word is looked up again (the lookup cache refills both fields together).
alter table public.vocab_notes
  add column if not exists example_translation text;
