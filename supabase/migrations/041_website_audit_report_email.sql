-- LV Website Opportunity Audit — "email me my report"
--
-- The audit stays ungated: the full report renders on screen before anything is
-- asked for. This adds an optional way to keep it. Someone who is already
-- looking at their report can have the link mailed to them, and that address is
-- recorded in the CRM as a deliberately separate, low-intent contact — never as
-- a lead. Asking for a copy of your own report is not a sales enquiry, and
-- filing it as one would corrupt the leads pipeline and overstate intent.
--
-- Anonymous visitors never read or write this table. The public Edge Function
-- proves possession of the audit access token and persists with the service
-- role, exactly as it does for audits, events and leads.

-- Suppression is deliberately NOT a new table. `public.email_suppressions` from
-- 008_campaigns.sql is already this sender's stop list: `send-campaign` reads it
-- to decide who not to write to, and `email-webhook` and `email-unsubscribe`
-- write to it on unsubscribe, bounce and spam reports. The audit tool honors and
-- extends that one list, so a person who unsubscribed from a campaign is not
-- mailed an audit report, and a person who clicks stop on an audit report is not
-- mailed a campaign. Two lists would mean a stop request that only half works.

-- ---------------------------------------------------------------------------
-- Report sends
-- ---------------------------------------------------------------------------

-- One row per (audit, address). The unique pair makes a double-click or a
-- browser retry idempotent, and the per-audit row count is what caps how many
-- different addresses a single audit can be used to mail — the mitigation that
-- keeps this endpoint from being a way to send LV Branding-branded mail to
-- strangers.
create table if not exists public.website_audit_report_sends (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.website_audits(id) on delete cascade,
  email text not null,
  interface_language text not null default 'en'
    check (interface_language in ('en', 'es')),
  crm_synced_at timestamptz,
  email_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists website_audit_report_sends_audit_email_idx
  on public.website_audit_report_sends (audit_id, lower(email));
create index if not exists website_audit_report_sends_created_idx
  on public.website_audit_report_sends (created_at desc);

alter table public.website_audit_report_sends enable row level security;

-- Reserving a send and enforcing the per-audit ceiling must happen in one
-- transaction, or two concurrent requests both read a count below the limit and
-- both insert. An address that asks twice gets its existing row back rather than
-- a refusal, so a visitor who never received the first mail can ask again.
create or replace function public.reserve_website_audit_report_send(
  p_audit_id uuid,
  p_email text,
  p_language text,
  p_max_per_audit integer
)
returns table (send_id uuid, created boolean, over_limit boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_send_id uuid;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('website-audit-report:' || p_audit_id::text, 0));

  select id into v_send_id
  from public.website_audit_report_sends
  where audit_id = p_audit_id and lower(email) = lower(p_email);

  if v_send_id is not null then
    return query select v_send_id, false, false;
    return;
  end if;

  select count(*) into v_count
  from public.website_audit_report_sends
  where audit_id = p_audit_id;

  if v_count >= p_max_per_audit then
    return query select null::uuid, false, true;
    return;
  end if;

  insert into public.website_audit_report_sends (audit_id, email, interface_language)
  values (p_audit_id, p_email, p_language)
  returning id into v_send_id;

  return query select v_send_id, true, false;
end;
$$;

revoke all on function public.reserve_website_audit_report_send(uuid, text, text, integer) from public;
revoke all on function public.reserve_website_audit_report_send(uuid, text, text, integer) from anon;
revoke all on function public.reserve_website_audit_report_send(uuid, text, text, integer) from authenticated;
grant execute on function public.reserve_website_audit_report_send(uuid, text, text, integer) to service_role;
