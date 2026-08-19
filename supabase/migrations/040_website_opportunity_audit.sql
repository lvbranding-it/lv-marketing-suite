-- LV Website Opportunity Audit
-- Anonymous visitors never read these tables directly. The public Edge Function
-- validates a short-lived bearer token and uses the service role for persistence.

-- A small, generic fixed-window limiter backs the public Edge endpoints. Keys are
-- SHA-256 fingerprints produced by the functions; raw client addresses and email
-- addresses are never persisted.
create table if not exists public.edge_rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  bucket_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

create index if not exists edge_rate_limit_buckets_updated_idx
  on public.edge_rate_limit_buckets (updated_at);

alter table public.edge_rate_limit_buckets enable row level security;

create or replace function public.consume_edge_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket public.edge_rate_limit_buckets%rowtype;
begin
  if p_scope is null or length(p_scope) < 1 or length(p_scope) > 80
     or p_key_hash is null or length(p_key_hash) < 32 or length(p_key_hash) > 128
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('edge-rate:' || p_scope || ':' || p_key_hash, 0));

  insert into public.edge_rate_limit_buckets (scope, key_hash, request_count)
  values (p_scope, p_key_hash, 0)
  on conflict (scope, key_hash) do nothing;

  select * into v_bucket
  from public.edge_rate_limit_buckets
  where scope = p_scope and key_hash = p_key_hash
  for update;

  if v_bucket.bucket_started_at <= now() - make_interval(secs => p_window_seconds) then
    update public.edge_rate_limit_buckets
    set bucket_started_at = now(), request_count = 1, updated_at = now()
    where scope = p_scope and key_hash = p_key_hash;
    return true;
  end if;

  if v_bucket.request_count >= p_limit then
    return false;
  end if;

  update public.edge_rate_limit_buckets
  set request_count = request_count + 1, updated_at = now()
  where scope = p_scope and key_hash = p_key_hash;
  return true;
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer) to service_role;

create table if not exists public.website_audits (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null,
  requested_url text not null,
  final_url text,
  normalized_domain text not null,
  request_fingerprint_hash text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  interface_language text not null default 'en'
    check (interface_language in ('en', 'es')),
  detected_language text
    check (detected_language is null or detected_language in ('en', 'es', 'unknown')),
  ruleset_version text not null default 'lv-website-opportunity-v1',
  coverage numeric(5,2),
  scores jsonb,
  answers jsonb not null default '{}'::jsonb,
  terms_accepted_at timestamptz not null,
  observation jsonb,
  error_code text,
  error_detail text,
  cached_from uuid references public.website_audits(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists website_audits_domain_created_idx
  on public.website_audits (normalized_domain, created_at desc);
create index if not exists website_audits_fingerprint_created_idx
  on public.website_audits (request_fingerprint_hash, created_at desc);
create index if not exists website_audits_expires_idx
  on public.website_audits (expires_at);
create index if not exists website_audits_cache_url_idx
  on public.website_audits using hash (requested_url)
  where observation is not null and status in ('completed', 'partial');
create index if not exists website_audits_cache_version_created_idx
  on public.website_audits (ruleset_version, created_at desc)
  where observation is not null and status in ('completed', 'partial');

-- Serialize reservations for the same anonymous client and destination. The
-- Edge Function's in-memory limiter is only a fast first line of defense;
-- this transaction is authoritative across concurrent workers.
create or replace function public.create_website_audit_job(
  p_id uuid,
  p_public_token_hash text,
  p_requested_url text,
  p_normalized_domain text,
  p_request_fingerprint_hash text,
  p_interface_language text,
  p_ruleset_version text,
  p_answers jsonb,
  p_terms_accepted_at timestamptz,
  p_started_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('website-audit-client:' || p_request_fingerprint_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('website-audit-domain:' || p_normalized_domain, 0));

  if (select count(*) from public.website_audits
      where request_fingerprint_hash = p_request_fingerprint_hash
        and created_at >= now() - interval '10 minutes') >= 8 then
    return 'client_limited';
  end if;
  if (select count(*) from public.website_audits
      where normalized_domain = p_normalized_domain
        and created_at >= now() - interval '10 minutes') >= 15 then
    return 'domain_limited';
  end if;

  insert into public.website_audits (
    id, public_token_hash, requested_url, normalized_domain,
    request_fingerprint_hash, status, interface_language, ruleset_version,
    answers, terms_accepted_at, started_at
  ) values (
    p_id, p_public_token_hash, p_requested_url, p_normalized_domain,
    p_request_fingerprint_hash, 'running', p_interface_language, p_ruleset_version,
    coalesce(p_answers, '{}'::jsonb), p_terms_accepted_at, p_started_at
  );
  return 'created';
end;
$$;

revoke all on function public.create_website_audit_job(uuid, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) from public;
revoke all on function public.create_website_audit_job(uuid, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) from anon;
revoke all on function public.create_website_audit_job(uuid, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) from authenticated;
grant execute on function public.create_website_audit_job(uuid, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) to service_role;

create table if not exists public.website_audit_pages (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.website_audits(id) on delete cascade,
  url text not null,
  final_url text not null,
  page_type text not null,
  title text,
  response_status integer,
  analysis_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (audit_id, final_url)
);

create index if not exists website_audit_pages_audit_idx
  on public.website_audit_pages (audit_id);

create table if not exists public.website_audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.website_audits(id) on delete cascade,
  rule_id text not null,
  dimension text not null,
  outcome text not null,
  severity smallint check (severity between 1 and 4),
  business_impact smallint check (business_impact between 1 and 4),
  effort smallint check (effort between 1 and 4),
  evidence_type text not null,
  earned_points numeric,
  max_points numeric,
  priority numeric,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (audit_id, rule_id)
);

create index if not exists website_audit_findings_audit_idx
  on public.website_audit_findings (audit_id);

create table if not exists public.website_audit_answers (
  audit_id uuid primary key references public.website_audits(id) on delete cascade,
  answers jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.website_audit_leads (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.website_audits(id) on delete cascade,
  name text not null,
  work_email text not null,
  company text not null,
  preferred_pathway text not null,
  timeline text not null,
  project_context text,
  consented_at timestamptz not null,
  lead_temperature text not null
    check (lead_temperature in ('high', 'medium', 'nurture')),
  source_data jsonb not null default '{}'::jsonb,
  notification_payload jsonb not null default '{}'::jsonb,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'processing', 'retry', 'delivered')),
  notification_attempts integer not null default 0 check (notification_attempts >= 0),
  notification_last_attempt_at timestamptz,
  notification_last_error text,
  notification_lease_token uuid,
  next_notification_at timestamptz not null default now(),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists website_audit_leads_audit_idx
  on public.website_audit_leads (audit_id);
drop index if exists public.website_audit_leads_once_per_audit_idx;
create unique index if not exists website_audit_leads_audit_email_idx
  on public.website_audit_leads (audit_id, lower(work_email));
create index if not exists website_audit_leads_outbox_idx
  on public.website_audit_leads (notification_status, next_notification_at);

-- The lead row and its durable notification payload are created together. The
-- advisory lock plus unique audit/email pair makes concurrent browser retries
-- return the same row while allowing a genuinely different contact to use a
-- privately shared result.
create or replace function public.create_website_audit_lead(
  p_audit_id uuid,
  p_name text,
  p_work_email text,
  p_company text,
  p_preferred_pathway text,
  p_timeline text,
  p_project_context text,
  p_consented_at timestamptz,
  p_lead_temperature text,
  p_source_data jsonb,
  p_notification_payload jsonb
)
returns table (lead_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('website-audit-lead:' || p_audit_id::text || ':' || lower(p_work_email), 0));

  select id into v_lead_id
  from public.website_audit_leads
  where audit_id = p_audit_id and lower(work_email) = lower(p_work_email);

  if v_lead_id is not null then
    return query select v_lead_id, false;
    return;
  end if;

  insert into public.website_audit_leads (
    audit_id, name, work_email, company, preferred_pathway, timeline,
    project_context, consented_at, lead_temperature, source_data,
    notification_payload, notification_status, next_notification_at
  ) values (
    p_audit_id, p_name, p_work_email, p_company, p_preferred_pathway, p_timeline,
    p_project_context, p_consented_at, p_lead_temperature,
    coalesce(p_source_data, '{}'::jsonb), coalesce(p_notification_payload, '{}'::jsonb),
    'pending', now()
  )
  returning id into v_lead_id;

  return query select v_lead_id, true;
end;
$$;

revoke all on function public.create_website_audit_lead(uuid, text, text, text, text, text, text, timestamptz, text, jsonb, jsonb) from public;
revoke all on function public.create_website_audit_lead(uuid, text, text, text, text, text, text, timestamptz, text, jsonb, jsonb) from anon;
revoke all on function public.create_website_audit_lead(uuid, text, text, text, text, text, text, timestamptz, text, jsonb, jsonb) from authenticated;
grant execute on function public.create_website_audit_lead(uuid, text, text, text, text, text, text, timestamptz, text, jsonb, jsonb) to service_role;

-- Claiming is an atomic lease. A worker that dies while delivering can be
-- reclaimed after five minutes, while a successful row can never be claimed
-- again. Downstream receives the lead UUID as its idempotency key.
create or replace function public.claim_website_audit_lead_notification(p_lead_id uuid)
returns table (lead_id uuid, notification_payload jsonb, notification_attempts integer, lease_token uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.website_audit_leads as lead
  set notification_status = 'processing',
      notification_attempts = lead.notification_attempts + 1,
      notification_last_attempt_at = now(),
      notification_last_error = null,
      notification_lease_token = gen_random_uuid()
  where lead.id = p_lead_id
    and lead.notification_payload <> '{}'::jsonb
    and (
      (lead.notification_status in ('pending', 'retry') and lead.next_notification_at <= now())
      or
      (lead.notification_status = 'processing' and lead.notification_last_attempt_at <= now() - interval '5 minutes')
    )
  returning lead.id, lead.notification_payload, lead.notification_attempts, lead.notification_lease_token;
$$;

revoke all on function public.claim_website_audit_lead_notification(uuid) from public;
revoke all on function public.claim_website_audit_lead_notification(uuid) from anon;
revoke all on function public.claim_website_audit_lead_notification(uuid) from authenticated;
grant execute on function public.claim_website_audit_lead_notification(uuid) to service_role;

create table if not exists public.website_audit_events (
  id bigint generated always as identity primary key,
  audit_id uuid references public.website_audits(id) on delete cascade,
  event_name text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_audit_events_audit_created_idx
  on public.website_audit_events (audit_id, created_at desc);

alter table public.website_audits enable row level security;
alter table public.website_audit_pages enable row level security;
alter table public.website_audit_findings enable row level security;
alter table public.website_audit_answers enable row level security;
alter table public.website_audit_leads enable row level security;
alter table public.website_audit_events enable row level security;

-- Audit bridge calls are retried by the outbox. A unique idempotency key keeps
-- a lost HTTP response from creating a second av_leads row or duplicate emails.
alter table if exists public.av_leads
  add column if not exists idempotency_key text,
  add column if not exists crm_synced_at timestamptz,
  add column if not exists team_email_sent_at timestamptz,
  add column if not exists prospect_email_sent_at timestamptz,
  add column if not exists delivery_last_error text,
  add column if not exists delivery_updated_at timestamptz,
  add column if not exists audit_summary jsonb,
  add column if not exists consent_record jsonb;
do $$
begin
  if to_regclass('public.av_leads') is not null then
    execute 'create unique index if not exists av_leads_idempotency_key_idx on public.av_leads (idempotency_key)';
  end if;
end;
$$;

comment on table public.website_audits is
  'Anonymous website audit jobs. Access is mediated by the website-audit Edge Function.';
comment on column public.website_audits.observation is
  'Normalized public-page signals only; never the complete fetched HTML response.';

-- The Edge Function also opportunistically sweeps expired rows. pg_cron makes
-- the 30-day deletion guarantee independent of future audit traffic.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.purge_expired_website_audits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.website_audits where expires_at < now();
  delete from public.website_audit_events
  where audit_id is null and created_at < now() - interval '30 days';
  delete from public.edge_rate_limit_buckets where updated_at < now() - interval '2 days';
$$;

revoke all on function public.purge_expired_website_audits() from public;
revoke all on function public.purge_expired_website_audits() from anon;
revoke all on function public.purge_expired_website_audits() from authenticated;

select cron.schedule(
  'website-opportunity-audit-retention',
  '17 3 * * *',
  $$select public.purge_expired_website_audits();$$
);

-- A one-minute scheduled drain makes retries independent of future visitor
-- traffic. Supabase Vault must contain `project_url` and `service_role_key`;
-- when they are not provisioned the migration remains usable and emits a clear
-- warning, while request-triggered draining continues as a fallback.
do $$
declare
  v_has_outbox_secrets boolean := false;
begin
  if to_regnamespace('vault') is not null then
    execute $check$
      select count(distinct name) = 2
      from vault.decrypted_secrets
      where name in ('project_url', 'service_role_key')
    $check$ into v_has_outbox_secrets;
  end if;

  if v_has_outbox_secrets then
    perform cron.schedule(
      'website-opportunity-audit-outbox',
      '* * * * *',
      $job$
        select net.http_post(
          url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1), '/') || '/functions/v1/website-audit',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
            -- The drain authenticates with its own secret rather than the
            -- service role key. Supabase injects SUPABASE_SERVICE_ROLE_KEY into
            -- the function itself and may issue a different value than the one
            -- stored here, which produced a silent 403 every minute in
            -- production. Falls back to the service role key so an environment
            -- without the drain secret keeps working.
            'Authorization', 'Bearer ' || coalesce(
              (select decrypted_secret from vault.decrypted_secrets where name = 'outbox_drain_secret' limit 1),
              (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
            )
          ),
          body := jsonb_build_object('action', 'drain'),
          timeout_milliseconds := 25000
        );
      $job$
    );
  else
    raise warning 'Website audit outbox cron not installed: add project_url and service_role_key to Supabase Vault, then schedule the drain command from migration 040.';
  end if;
end;
$$;
