-- Minimal stand-ins for the parts of a hosted Supabase project the migrations touch, so the
-- schema and its lifecycle rules can be exercised against a plain Postgres in CI.
-- NOT used in production: Supabase provides all of this for real.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists auth;
-- Stand-in for Supabase's auth.uid(); the migrations only ever read it.
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create extension if not exists pgcrypto;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz, metadata jsonb);
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;
create or replace function storage.filename(name text) returns text
language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name,'/'),1)] $$;
