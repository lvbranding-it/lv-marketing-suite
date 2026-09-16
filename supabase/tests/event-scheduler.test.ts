import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uid(1);
const otherOrg = uid(2);
const admin = uid(10);
const outsider = uid(11);
let db: PGlite;
let eventId: string;

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
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(
    readFileSync(new URL("../migrations/20260916181000_event_scheduler.sql", import.meta.url), "utf8"),
  );
}, 30000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    reset role;
    truncate public.event_schedule_bookings, public.event_schedule_events,
      public.team_members, public.organizations, auth.users cascade;
  `);
  await db.query("insert into auth.users values($1,'admin@example.test'),($2,'outside@example.test')", [admin, outsider]);
  await db.query("insert into public.organizations values($1,'LV'),($2,'Other')", [org, otherOrg]);
  await db.query("insert into public.team_members values($1,$2,'owner'),($3,$4,'owner')", [org, admin, otherOrg, outsider]);
  await as(admin);
  eventId = (await scalar(
    `insert into public.event_schedule_events
      (org_id,name,location,dates,time_slots,is_featured)
     values($1,'Launch Event','Houston',array['2026-12-13'::date],array['10:00-11:00'],true)
     returning id`,
    [org],
  )) as string;
});

describe("event scheduler database boundary", () => {
  it("shows active event configuration publicly but keeps booking PII private", async () => {
    await as("", "anon");
    expect(await scalar("select count(*) from event_schedule_events")).toBe(1);
    await expect(db.query("select * from event_schedule_bookings")).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("creates a valid public booking and exposes only its occupied slot", async () => {
    await as("", "anon");
    const bookingId = await scalar(
      "select book_event_schedule_slot($1,'Guest','guest@example.test','2026-12-13','10:05')",
      [eventId],
    );
    expect(bookingId).toEqual(expect.any(String));
    const slots = await db.query(
      "select * from event_schedule_booked_slots($1)",
      [eventId],
    );
    expect(slots.rows).toHaveLength(1);
    expect((slots.rows[0].booking_date as Date).toISOString().slice(0, 10)).toBe("2026-12-13");
    expect(slots.rows[0].slot_time).toBe("10:05");
    expect(Object.keys(slots.rows[0])).not.toContain("guest_email");
  });

  it("rejects double-booking, duplicate emails and out-of-range input", async () => {
    await as("", "anon");
    await db.query(
      "select book_event_schedule_slot($1,'First','first@example.test','2026-12-13','10:10')",
      [eventId],
    );
    await expect(
      db.query(
        "select book_event_schedule_slot($1,'Second','second@example.test','2026-12-13','10:10')",
        [eventId],
      ),
    ).rejects.toThrow(/SLOT_UNAVAILABLE/);
    await expect(
      db.query(
        "select book_event_schedule_slot($1,'First Again','first@example.test','2026-12-13','10:15')",
        [eventId],
      ),
    ).rejects.toThrow(/EMAIL_ALREADY_BOOKED/);
    await expect(
      db.query(
        "select book_event_schedule_slot($1,'Late','late@example.test','2026-12-13','12:00')",
        [eventId],
      ),
    ).rejects.toThrow(/INVALID_EVENT_TIME/);
  });

  it("scopes administration to the owning organization", async () => {
    await as(outsider);
    expect(await scalar("select count(*) from event_schedule_bookings")).toBe(0);
    await expect(
      db.query("select set_event_schedule_featured($1)", [eventId]),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
