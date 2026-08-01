-- Fix: migration 20260715000000 (already run by hand against the live
-- Supabase project on 2026-07-17, per project memory) incorrectly defaulted
-- is_public to true, opting all existing users into public visibility
-- without consent. Privacy-first policy: is_public should default to false,
-- and users must explicitly opt in via the UI.
--
-- Do not edit 20260715000000 to fix this — it already ran, and editing it
-- would not change the live column default. This ALTER is what actually
-- changes the live database, so new signups via ensure_profile() (which
-- doesn't set is_public and relies on the column default) stop being
-- opted into public visibility.
alter table profiles
  alter column is_public set default false;

-- Reset all existing rows to private; the UI (ProfileEditModal) lets users
-- opt back in if desired.
update profiles
set is_public = false;
