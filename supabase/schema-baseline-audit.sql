-- Read-only schema metadata. Contains no application records.
select jsonb_build_object(
  'columns', (select coalesce(jsonb_agg(metadata), '[]'::jsonb) from (-- Read-only metadata audit. Run against staging/production before reconciliation.
-- Does not select application records, secrets, or conversation content.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('agent_runs', 'projects', 'profiles', 'team_members',
    'branch_team_members', 'invitations', 'activity_log')
order by table_name, ordinal_position) metadata),
  'rls', (select coalesce(jsonb_agg(metadata), '[]'::jsonb) from (select c.relname as table_name, c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('agent_runs', 'projects', 'profiles', 'team_members',
    'branch_team_members', 'invitations', 'activity_log')) metadata),
  'policies', (select coalesce(jsonb_agg(metadata), '[]'::jsonb) from (select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('agent_runs', 'projects', 'profiles', 'team_members',
    'branch_team_members', 'invitations', 'activity_log')
order by tablename, policyname) metadata),
  'grants', (select coalesce(jsonb_agg(metadata), '[]'::jsonb) from (select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('agent_runs', 'projects')
order by table_name, grantee, privilege_type) metadata),
  'constraints', (select coalesce(jsonb_agg(metadata), '[]'::jsonb) from (select c.relname as table_name, con.conname,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('agent_runs', 'projects')
order by c.relname, con.conname) metadata)
) as baseline;
