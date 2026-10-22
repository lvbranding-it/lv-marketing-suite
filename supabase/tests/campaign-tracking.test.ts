import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create table organizations(id uuid primary key); create table contacts(id uuid primary key);
 create function is_org_member(uuid) returns boolean language sql as $$select false$$;
 create function update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;`);
 await db.exec(readFileSync(new URL('../migrations/008_campaigns.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../migrations/20261022120000_campaign_tracking_sharing.sql',import.meta.url),'utf8'));
 await db.query('insert into organizations values ($1)',[id(1)]);
},30000);
afterAll(()=>db?.close());
beforeEach(async()=>{
 await db.exec('reset role; truncate email_suppressions,email_campaign_recipients,email_campaigns cascade');
 await db.query("insert into email_campaigns(id,org_id,name,status,sent_count) values($1,$2,'Campaign','sent',1)",[id(2),id(1)]);
 await db.query("insert into email_campaign_recipients(id,campaign_id,org_id,email,status) values($1,$2,$3,'person@example.com','sent')",[id(3),id(2),id(1)]);
});
const record=(event:string, status:string|null=null, suppress:string|null=null,campaign=id(2))=>db.query('select record_campaign_event($1,$2,$3,now(),$4,$5,$6)',[id(3),campaign,event,status,'Delivery failed',suppress]);
const stats=async()=>(await db.query<any>('select * from email_campaigns')).rows[0];
const recipient=async()=>(await db.query<any>('select * from email_campaign_recipients')).rows[0];
describe('campaign tracking transactions',()=>{
 it('counts first open and first click only, including concurrent retries',async()=>{
  await Promise.all([record('click'),record('click'),record('open'),record('open')]);
  expect(await stats()).toMatchObject({open_count:1,click_count:1});
  expect((await recipient()).status).toBe('clicked');
 });
 it('preserves unsubscribe status when an open arrives later',async()=>{
  await record('unsubscribe'); await record('open'); await record('click'); await record('unsubscribe');
  expect(await stats()).toMatchObject({open_count:1,click_count:1,unsubscribe_count:1});
  expect((await recipient()).status).toBe('unsubscribed');
 });
 it('does not double count a bounce replay after unsubscribe',async()=>{
  await record('bounce','bounced','bounced'); await record('unsubscribe'); await record('bounce','bounced','bounced');
  expect(await stats()).toMatchObject({bounce_count:1,unsubscribe_count:1});
  expect((await recipient()).status).toBe('unsubscribed');
  expect((await db.query<any>('select reason from email_suppressions')).rows[0].reason).toBe('unsubscribed');
 });
 it('does not count soft failures as permanent bounces',async()=>{
  await record('blocked','failed'); await record('blocked','failed');
  expect((await stats()).bounce_count).toBe(0);
  expect((await recipient()).status).toBe('failed');
 });
 it('ignores unrelated campaign identifiers',async()=>{
  await record('open',null,null,id(4)); expect((await stats()).open_count).toBe(0);
 });
 it('rolls back recipient and counters when suppression persistence fails',async()=>{
  await expect(record('bounce','bounced','bad-reason')).rejects.toThrow();
  expect((await recipient()).status).toBe('sent'); expect((await stats()).bounce_count).toBe(0);
 });
 it('does not allow clients to forge tracking events',async()=>{
  await db.exec('set role authenticated');
  await expect(record('open')).rejects.toThrow(/permission denied/);
 });
 it('keeps sharing off by default and campaign data private to anonymous users',async()=>{
  expect((await stats()).share_token).toBeNull();
  await db.exec('grant select on email_campaigns to anon; set role anon');
  expect((await db.query('select * from email_campaigns')).rows).toEqual([]);
 });
});
