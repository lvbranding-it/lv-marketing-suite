/**
 * migrate-from-boss.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrates projects + agent runs + brand snapshots + clients
 * from lv-branding-boss  →  lv-marketing-suite
 *
 * Usage:
 *   BOSS_SERVICE_KEY=<key> SUITE_SERVICE_KEY=<key> node scripts/migrate-from-boss.mjs
 *
 * Both keys are service_role keys from each project's Supabase dashboard:
 *   Boss  → https://supabase.com/dashboard/project/egarcsgsesesqaojfvlc/settings/api
 *   Suite → https://supabase.com/dashboard/project/kgdeqwjuspiqraxrlcew/settings/api
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────
const BOSS_URL  = "https://egarcsgsesesqaojfvlc.supabase.co";
const SUITE_URL = "https://kgdeqwjuspiqraxrlcew.supabase.co";

// Target org in the suite (Admin LV Branding's Workspace)
const SUITE_ORG_ID = "0122121e-5dec-446e-92b3-4e85b145910a";

const BOSS_KEY  = process.env.BOSS_SERVICE_KEY;
const SUITE_KEY = process.env.SUITE_SERVICE_KEY;

if (!BOSS_KEY || !SUITE_KEY) {
  console.error(`
❌  Missing service role keys. Run as:

  BOSS_SERVICE_KEY=<key> SUITE_SERVICE_KEY=<key> node scripts/migrate-from-boss.mjs

Get your keys from:
  Boss  → https://supabase.com/dashboard/project/egarcsgsesesqaojfvlc/settings/api
  Suite → https://supabase.com/dashboard/project/kgdeqwjuspiqraxrlcew/settings/api
`);
  process.exit(1);
}

const boss  = createClient(BOSS_URL,  BOSS_KEY,  { auth: { persistSession: false } });
const suite = createClient(SUITE_URL, SUITE_KEY, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }
function warn(msg)        { console.warn(`⚠️   ${msg}`); }
function ok(msg)          { console.log(`✅  ${msg}`); }

// ── Step 1: Read boss data ────────────────────────────────────────────────────
async function readBoss() {
  log("📖", "Reading projects from boss…");
  const { data: projects, error: pErr } = await boss
    .from("projects")
    .select("id, name, status, brand_snapshot, created_at, updated_at, client_id");
  if (pErr) throw new Error(`Boss projects read failed: ${pErr.message}`);
  log("📋", `Found ${projects.length} project(s) in boss`);

  // Read clients so we can resolve client names
  log("📖", "Reading clients from boss…");
  const { data: clients, error: cErr } = await boss
    .from("clients")
    .select("id, company_name, contact_name, email, phone, website, industry, location, notes, status");
  if (cErr) {
    warn(`Could not read boss clients (${cErr.message}) — client names will be blank`);
  }
  const clientMap = new Map((clients || []).map((c) => [c.id, c]));

  // Read agent runs
  log("📖", "Reading agent runs from boss…");
  const { data: runs, error: rErr } = await boss
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: true });
  if (rErr) throw new Error(`Boss agent_runs read failed: ${rErr.message}`);
  log("🏃", `Found ${runs.length} agent run(s) in boss`);

  return { projects, clientMap, runs };
}

// ── Step 2: Read what suite already has ──────────────────────────────────────
async function readSuite() {
  log("📖", "Reading existing suite projects…");
  const { data: projects, error } = await suite
    .from("projects")
    .select("id, name, brand_snapshot")
    .eq("org_id", SUITE_ORG_ID);
  if (error) throw new Error(`Suite projects read failed: ${error.message}`);

  const { data: runs } = await suite
    .from("agent_runs")
    .select("id, project_id, created_at, input");

  return {
    projectByName: new Map(projects.map((p) => [p.name.trim().toLowerCase(), p])),
    existingRunIds: new Set((runs || []).map((r) => r.id)),
  };
}

// ── Step 3: Migrate ───────────────────────────────────────────────────────────
async function migrate() {
  console.log("\n🚀  Starting lv-branding-boss → lv-marketing-suite migration\n");

  const { projects, clientMap, runs } = await readBoss();
  const { projectByName, existingRunIds } = await readSuite();

  // Map boss project ID → suite project ID
  const projectIdMap = new Map(); // bossId → suiteId

  let projectsCreated = 0;
  let projectsUpdated = 0;
  let runsCreated    = 0;
  let runsSkipped    = 0;
  let contactsCreated = 0;

  // ── 3a: Upsert projects ───────────────────────────────────────────────────
  console.log("\n── Projects ──────────────────────────────────────────────────");
  for (const bp of projects) {
    const client     = bp.client_id ? clientMap.get(bp.client_id) : null;
    const clientName = client?.company_name ?? null;
    const key        = bp.name.trim().toLowerCase();
    const existing   = projectByName.get(key);

    const hasSnapshot = bp.brand_snapshot && Object.keys(bp.brand_snapshot).length > 0;

    if (existing) {
      // Project already in suite — update brand_snapshot if boss has one and suite doesn't
      const suiteHasSnapshot = existing.brand_snapshot && Object.keys(existing.brand_snapshot).length > 0;
      if (hasSnapshot && !suiteHasSnapshot) {
        const { error } = await suite
          .from("projects")
          .update({ brand_snapshot: bp.brand_snapshot, client_name: clientName ?? existing.client_name })
          .eq("id", existing.id);
        if (error) warn(`Could not update snapshot for "${bp.name}": ${error.message}`);
        else { log("🔄", `Updated brand snapshot for: ${bp.name}`); projectsUpdated++; }
      } else {
        log("⏩", `Skipped (already exists): ${bp.name}`);
      }
      projectIdMap.set(bp.id, existing.id);
    } else {
      // Create new project in suite
      const { data: newProj, error } = await suite
        .from("projects")
        .insert({
          org_id:         SUITE_ORG_ID,
          name:           bp.name,
          client_name:    clientName,
          status:         bp.status ?? "active",
          brand_snapshot: bp.brand_snapshot ?? {},
          created_at:     bp.created_at,
          updated_at:     bp.updated_at,
        })
        .select("id")
        .single();
      if (error) { warn(`Could not create project "${bp.name}": ${error.message}`); continue; }
      log("✨", `Created project: ${bp.name}${clientName ? ` (${clientName})` : ""}`);
      projectIdMap.set(bp.id, newProj.id);
      projectsCreated++;
    }
  }

  // ── 3b: Migrate agent runs ─────────────────────────────────────────────────
  console.log("\n── Agent Runs ────────────────────────────────────────────────");
  for (const run of runs) {
    const suiteProjectId = projectIdMap.get(run.project_id);
    if (!suiteProjectId) {
      warn(`No suite project found for boss project ${run.project_id} — skipping run ${run.id}`);
      runsSkipped++;
      continue;
    }

    // Skip if this run ID already exists in suite
    if (existingRunIds.has(run.id)) {
      runsSkipped++;
      continue;
    }

    const { error } = await suite.from("agent_runs").insert({
      id:                 run.id,           // keep original ID
      org_id:             SUITE_ORG_ID,
      project_id:         suiteProjectId,
      agent_id:           run.agent_id,
      agent_pack_version: run.agent_pack_version ?? "1.0",
      input:              run.input,
      output_full_text:   run.output_full_text,
      output_sections:    run.output_sections ?? [],
      brand_snapshot:     run.brand_snapshot ?? {},
      snapshot_delta:     run.snapshot_delta ?? {},
      language_control:   run.language_control ?? { language: "EN" },
      mode:               run.mode ?? "create",
      model:              run.model ?? "claude-sonnet-4-6",
      status:             run.status ?? "completed",
      usage:              run.usage ?? {},
      completed_at:       run.completed_at,
      created_at:         run.created_at,
    });

    if (error) {
      warn(`Could not migrate run ${run.id}: ${error.message}`);
      runsSkipped++;
    } else {
      const agentShort = run.agent_id?.split("_").slice(0, 2).join(" ") ?? run.agent_id;
      const preview    = (run.input?.text ?? "").slice(0, 40);
      log("🏃", `  Run: [${agentShort}] "${preview}…"`);
      runsCreated++;
    }
  }

  // ── 3c: Migrate clients → contacts ────────────────────────────────────────
  if (clientMap.size > 0) {
    console.log("\n── Clients → Contacts ────────────────────────────────────────");

    // Check what contacts already exist in suite
    const { data: existingContacts } = await suite
      .from("contacts")
      .select("id, company, email")
      .eq("org_id", SUITE_ORG_ID);
    const existingCompanies = new Set(
      (existingContacts || []).map((c) => c.company?.trim().toLowerCase()).filter(Boolean)
    );

    for (const client of clientMap.values()) {
      const companyKey = client.company_name?.trim().toLowerCase();
      if (companyKey && existingCompanies.has(companyKey)) {
        log("⏩", `Contact already exists: ${client.company_name}`);
        continue;
      }

      // Parse location into city / state
      const locationParts = (client.location ?? "").split(",").map((s) => s.trim());
      const city  = locationParts[0] || null;
      const state = locationParts[1] || null;

      const nameParts = (client.contact_name ?? "").trim().split(" ");
      const firstName = nameParts[0] || null;
      const lastName  = nameParts.slice(1).join(" ") || null;

      const { error } = await suite.from("contacts").insert({
        org_id:         SUITE_ORG_ID,
        first_name:     firstName,
        last_name:      lastName,
        company:        client.company_name,
        email:          client.email,
        phone:          client.phone,
        website:        client.website,
        industry:       client.industry,
        city,
        state,
        crm_notes:      client.notes,
        pipeline_stage: client.status === "lead" ? "lead" : "qualified",
        source:         "manual",
        raw_data:       {},
        signals:        [],
      });

      if (error) warn(`Could not create contact "${client.company_name}": ${error.message}`);
      else { log("👤", `Created contact: ${client.company_name}`); contactsCreated++; }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════╗
║           Migration Complete ✅           ║
╠══════════════════════════════════════════╣
║  Projects created:   ${String(projectsCreated).padEnd(19)} ║
║  Projects updated:   ${String(projectsUpdated).padEnd(19)} ║
║  Agent runs copied:  ${String(runsCreated).padEnd(19)} ║
║  Runs skipped:       ${String(runsSkipped).padEnd(19)} ║
║  Contacts created:   ${String(contactsCreated).padEnd(19)} ║
╚══════════════════════════════════════════╝

Head to https://marketing.lvbranding.com/agents to see your migrated projects.
`);
}

migrate().catch((err) => {
  console.error("\n❌  Migration failed:", err.message);
  process.exit(1);
});
