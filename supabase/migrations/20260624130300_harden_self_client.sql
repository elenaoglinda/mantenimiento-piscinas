-- Phase 2.3 hardening — create_self_client is a trigger function only; it must not be exposed
-- as a callable RPC. Revoke the default PUBLIC EXECUTE so anon/authenticated can't invoke it.
revoke execute on function public.create_self_client() from public, anon, authenticated;
