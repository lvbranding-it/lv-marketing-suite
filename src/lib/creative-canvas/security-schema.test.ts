import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../../supabase/creative-canvas-migrations/202609100001_creative_canvas_foundation.sql", import.meta.url), "utf8");

describe("creative canvas database security contract", () => {
  it("enables RLS and protects project ownership boundaries", () => {
    for (const table of ["creative_canvases", "brand_contexts", "creative_assets", "asset_versions", "creative_directions", "ai_generations", "creative_decisions", "creative_comments", "ai_usage_ledger"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("can_view_creative_project");
    expect(sql).toContain("can_edit_creative_project");
    expect(sql).toContain("p.id = target_project_id and p.org_id = target_org_id");
  });

  it("ties every denormalized org_id back to its project, on write as well as insert", () => {
    // org_id drives the usage ledger and the monthly budget query, so a row
    // pointing at the wrong organization misattributes real spend.
    for (const policy of [
      "creative_canvases_insert", "creative_canvases_update",
      "creative_assets_insert", "creative_assets_update",
      "brand_contexts_write", "creative_directions_write",
      "ai_generations_insert", "creative_decisions_insert", "creative_comments_write",
    ]) {
      const clause = sql.slice(sql.indexOf(`create policy ${policy} `));
      expect(clause.slice(0, clause.indexOf(";"))).toContain("creative_org_matches_project(project_id, org_id)");
    }
  });

  it("grants Canvas per member rather than to the whole organization", () => {
    // Hiding the navigation entry is not the gate; the role function is.
    expect(sql).toContain("tm.feature_access -> 'creativeCanvas'");
    expect(sql).toContain("null::public.creative_access_role");
  });

  it("keeps signed assets private and scoped by organization/project path", () => {
    expect(sql).toMatch(/'creative-canvas-assets'.*false/s);
    // A malformed path segment must deny rather than raise 22P02 inside a policy.
    expect(sql).toContain("public.creative_path_uuid((storage.foldername(name))[2])");
    expect(sql).not.toContain("storage.foldername(name))[2]::uuid");
    expect(sql).toContain("p.org_id::text = (storage.foldername(name))[1]");
  });

  it("preserves idempotency, lineage, failed generations, and server-owned usage", () => {
    expect(sql).toContain("unique (user_id, idempotency_key)");
    expect(sql).toContain("parent_generation_id uuid references public.ai_generations");
    expect(sql).toContain("parent_version_id uuid references public.asset_versions");
    expect(sql).toContain("status public.creative_generation_status");
    expect(sql).toContain("revoke insert, update, delete on public.ai_usage_ledger from authenticated");
  });

  it("requires authorization for export source data", () => {
    expect(sql).toContain("creative_canvases_select");
    expect(sql).toContain("creative_assets_select");
    expect(sql).toContain("public.can_view_creative_project(project_id)");
  });
});
