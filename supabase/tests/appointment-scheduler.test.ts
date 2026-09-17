import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uid(1);
const otherOrg = uid(2);
const admin = uid(10);
const outsider = uid(11);
let db: PGlite;
let pageId: string;
let hostId: string;

const as = async (user: string, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`set role ${role}`);
};

const scalar = async (sql: string, args: unknown[] = []) =>
  Object.values((await db.query<Record<string, unknown>>(sql, args)).rows[0])[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.organizations(id uuid primary key, name text not null);
    create table public.team_members(
      org_id uuid references public.organizations(id),
      user_id uuid references auth.users(id),
      role text,
      primary key(org_id, user_id)
    );
    create function public.is_org_member(_org_id uuid)
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists(select 1 from team_members where org_id = _org_id and user_id = auth.uid()) $$;
    create function public.org_role(_org_id uuid)
    returns text language sql stable security definer set search_path = public
    as $$ select role from team_members where org_id = _org_id and user_id = auth.uid() limit 1 $$;
    create function public.update_updated_at_column()
    returns trigger language plpgsql set search_path = public
    as $$ begin new.updated_at = now(); return new; end $$;
    create table public.contacts(
      id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
      first_name text, last_name text, email text, phone text, company text,
      source text not null default 'manual', tags text[] not null default '{}', raw_data jsonb not null default '{}',
      pipeline_stage text default 'lead', updated_at timestamptz default now(), unique(org_id,email)
    );
    create table public.contact_activities(
      id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
      contact_id uuid not null references public.contacts(id), created_by uuid, created_at timestamptz default now(),
      type text not null, body text not null, meta jsonb not null default '{}'
    );
    grant select on public.contacts, public.contact_activities to authenticated;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(readFileSync(new URL("../migrations/20260917170000_appointment_scheduler.sql", import.meta.url), "utf8"));
}, 30000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
    reset role;
    truncate public.appointment_oauth_states, public.appointment_calendar_connections,
      public.appointment_bookings, public.appointment_busy_blocks, public.appointment_host_availability,
      public.appointment_hosts, public.appointment_booking_pages, public.contact_activities,
      public.contacts, public.team_members, public.organizations, auth.users cascade;
  `);
  await db.query("insert into auth.users values($1,'admin@lvbranding.com'),($2,'outside@example.test')", [admin, outsider]);
  await db.query("insert into public.organizations values($1,'LV'),($2,'Other')", [org, otherOrg]);
  await db.query("insert into public.team_members values($1,$2,'owner'),($3,$4,'owner')", [org, admin, otherOrg, outsider]);
  await as(admin);
  pageId = await scalar("select ensure_appointment_booking_page($1)", [org]) as string;
  hostId = await scalar("select id from appointment_hosts where page_id=$1", [pageId]) as string;
});

describe("prospect appointment scheduler database boundary", () => {
  it("creates Admin as the default host with weekday business hours", async () => {
    expect(await scalar("select email from appointment_hosts where id=$1", [hostId])).toBe("admin@lvbranding.com");
    expect(await scalar("select is_default from appointment_hosts where id=$1", [hostId])).toBe(true);
    expect(await scalar("select count(*) from appointment_host_availability where host_id=$1", [hostId])).toBe(5);
  });

  it("does not restore weekdays an administrator removed", async () => {
    await db.query("delete from appointment_host_availability where host_id=$1 and weekday in (1,5)", [hostId]);
    await db.query("select ensure_appointment_booking_page($1)", [org]);
    expect(await scalar("select count(*) from appointment_host_availability where host_id=$1", [hostId])).toBe(3);
    expect((await db.query("select weekday from appointment_host_availability where host_id=$1 order by weekday", [hostId])).rows)
      .toEqual([{ weekday: 2 }, { weekday: 3 }, { weekday: 4 }]);
  });

  it("exposes only a public-safe page and available slots", async () => {
    await db.query("update appointment_booking_pages set minimum_notice_hours=0, booking_window_days=365 where id=$1", [pageId]);
    await as("", "anon");
    const page = await scalar("select get_public_appointment_page('lv-branding-consultation')") as Record<string, unknown>;
    expect(page).toMatchObject({ slug: "lv-branding-consultation" });
    expect(JSON.stringify(page)).not.toContain("admin@lvbranding.com");
    await expect(db.query("select * from appointment_bookings")).rejects.toMatchObject({ code: "42501" });
  });

  it("books an exact open time, creates a CRM lead and blocks duplicate attendees", async () => {
    await as(admin);
    await db.query("update appointment_booking_pages set minimum_notice_hours=0, booking_window_days=365 where id=$1", [pageId]);
    const slot = await scalar(
      "select starts_at from get_appointment_available_slots($1,$2,current_date,current_date+30) limit 1",
      ["lv-branding-consultation", hostId],
    ) as Date;
    await as("", "service_role");
    const booking = await scalar(
      "select book_public_appointment($1,$2,'Prospect Person','prospect@example.test','','Acme','New website',$3)",
      ["lv-branding-consultation", hostId, slot],
    );
    expect(booking).toEqual(expect.any(String));
    await as(admin);
    expect(await scalar("select count(*) from contacts where email='prospect@example.test'" )).toBe(1);
    expect(await scalar("select count(*) from contact_activities where type='meeting'" )).toBe(1);
    await as("", "service_role");
    await expect(db.query(
      "select book_public_appointment($1,$2,'Prospect Person','prospect@example.test','',null,null,$3)",
      ["lv-branding-consultation", hostId, new Date(slot.getTime() + 45 * 60_000)],
    )).rejects.toThrow(/EMAIL_ALREADY_BOOKED|SLOT_UNAVAILABLE/);
  });

  it("removes manual busy time from public availability", async () => {
    await as(admin);
    await db.query("update appointment_booking_pages set minimum_notice_hours=0, booking_window_days=365 where id=$1", [pageId]);
    const slot = await scalar(
      "select starts_at from get_appointment_available_slots($1,$2,current_date,current_date+30) limit 1",
      ["lv-branding-consultation", hostId],
    ) as Date;
    await db.query("insert into appointment_busy_blocks(host_id,org_id,starts_at,ends_at) values($1,$2,$3,$4)",
      [hostId, org, slot, new Date(slot.getTime() + 30 * 60_000)]);
    await as("", "anon");
    expect(await scalar("select count(*) from get_appointment_available_slots($1,$2,$3::date,$3::date) where starts_at=$3",
      ["lv-branding-consultation", hostId, slot])).toBe(0);
  });

  it("prevents another organization from managing the page", async () => {
    await as(outsider);
    expect(await scalar("select count(*) from appointment_booking_pages")).toBe(0);
    await expect(db.query("select ensure_appointment_booking_page($1)", [org])).rejects.toMatchObject({ code: "42501" });
  });

  it("does not allow browsers to bypass the booking edge function", async () => {
    await as("", "anon");
    await expect(db.query(
      "select book_public_appointment($1,$2,'Guest','guest@example.test','',null,null,now()+interval '2 days')",
      ["lv-branding-consultation", hostId],
    )).rejects.toMatchObject({ code: "42501" });
  });
});
