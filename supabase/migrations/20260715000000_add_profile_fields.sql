-- User profile fields: bio, external links, and public visibility toggle.
-- profiles already has RLS enabled with no policies (service role only),
-- matching the sharing tables' convention — no policy changes needed here.
alter table profiles
  add column if not exists bio text,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists is_public boolean not null default true;
