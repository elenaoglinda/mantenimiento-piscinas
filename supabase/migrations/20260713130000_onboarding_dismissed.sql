-- Phase 7 (Feature 2) — Dashboard onboarding checklist dismissal.
--
-- The dashboard shows a getting-started checklist to newly created accounts. Persisting the
-- "skip" per org keeps it hidden after the account is set up. Org-level (rather than per user)
-- because the checklist tracks org setup (first client/pool/report/export). Updated through
-- the existing admin-only org UPDATE policy from init_tenancy.sql — no new policy needed.

alter table public.org
  add column onboarding_dismissed_at timestamptz;
