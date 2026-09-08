-- Historical SQL recovered from the production migration ledger on 2026-09-08.
-- Evidence only: already applied remotely. Do not replay on production.

-- 1. Add brand_snapshot to existing projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Agent runs table
CREATE TABLE IF NOT EXISTS agent_runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id         uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id           text        NOT NULL,
  agent_pack_version text        NOT NULL DEFAULT '1.1',
  input              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  output_full_text   text        NOT NULL DEFAULT '',
  output_sections    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  brand_snapshot     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  snapshot_delta     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  assumptions        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  qa                 jsonb       NOT NULL DEFAULT '[]'::jsonb,
  language_control   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  mode               text        NOT NULL DEFAULT 'create',
  model              text        NOT NULL DEFAULT 'claude-sonnet-4-6',
  provider           text        NOT NULL DEFAULT 'anthropic',
  parent_run_id      uuid        REFERENCES agent_runs(id) ON DELETE SET NULL,
  status             text        NOT NULL DEFAULT 'pending',
  usage              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error              text,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS agent_runs_project_id_idx  ON agent_runs(project_id);
CREATE INDEX IF NOT EXISTS agent_runs_org_id_idx      ON agent_runs(org_id);
CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx  ON agent_runs(created_at DESC);

-- 4. RLS
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_select" ON agent_runs
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "agent_runs_insert" ON agent_runs
  FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "agent_runs_update" ON agent_runs
  FOR UPDATE USING (is_org_member(org_id));

