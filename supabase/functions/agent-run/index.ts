/**
 * agent-run — authenticated endpoint
 * Runs one of the 9 LV Branding AI agents against a project using Claude API.
 * Parses output sections (A)–K)) and <SNAPSHOT_JSON> tags.
 * Updates project.brand_snapshot and persists the agent_run record.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLAUDE_API_KEY  = Deno.env.get("CLAUDE_API_KEY")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL           = "claude-sonnet-4-6";
const AGENT_PACK_VER  = "1.1";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Agent configs ─────────────────────────────────────────────────────────────

const AGENT_OS_RULES = `
AGENT OS — Rules (always follow):
1. Confirm Language Control (EN/ES/BILINGUAL). If missing, ask once.
2. PHASE 1 — DISCOVERY: On the FIRST interaction, ask your critical questions (up to 5; Client Comms: up to 3). Present as a numbered list. Do NOT produce the full output yet. Wait for answers.
3. PHASE 2 — DELIVERY: Once answered (or user says to proceed), produce the full client-ready output using the required format. Label remaining gaps as "Assumption".
4. Build or update Brand Snapshot from all info provided.
5. Run QA checklist: gaps, risks, contradictions, what to confirm next.
6. End deliverables with Next Steps + Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON> tags.
7. NEVER combine Phase 1 and Phase 2 in the same message.
`;

const AGENTS: Record<string, { systemPrompt: string; requiredFields: string[] }> = {
  lead_intel_v1: {
    systemPrompt: `You are the LV Branding Lead Intel Agent.\n\nGOAL: Turn a prospect name + website into a sales-ready intel brief: positioning notes, weaknesses, quick wins, pitch angles, and recommended first offer.\n\nRULES:\n- Follow AGENT OS — Rules.\n- If website/social is missing, ask once.\n- Keep outputs client-ready and actionable.\n\nOUTPUT FORMAT:\nA) Snapshot (what they are + what they sell)\nB) Positioning (current message, target audience guess)\nC) What's working (strengths)\nD) What's weak (gaps, confusion, credibility, conversion)\nE) Quick wins (7-day / 30-day)\nF) Pitch angles (3 angles + 1-liner each)\nG) Recommended first engagement (best starter package + why)\nH) 5 questions to qualify (max 5)\nI) QA notes + assumptions\nJ) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: ["prospect_name"],
  },
  brief_strategy_deliverables_v1: {
    systemPrompt: `You are the LV Branding Brief→Strategy+Deliverables Agent.\n\nGOAL: Convert a messy brief into strategy + deliverables plan + timeline + roles + risks.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Ask max 5 questions.\n- Always include: audience, offer, differentiator, proof, channels, CTA.\n- Provide 3 tiers (Good/Better/Best) unless user says otherwise.\n\nOUTPUT FORMAT:\nA) Brief Snapshot (what we know)\nB) 5 Key Questions (max 5)\nC) Assumptions (if needed)\nD) Strategy (Positioning + Messaging Pillars + CTA)\nE) Deliverables Plan (by channel)\nF) Packages (Good/Better/Best)\nG) Timeline (Weeks)\nH) Roles & Responsibilities (Client vs LV Branding)\nI) Risks + QA Notes\nJ) Next Steps\nK) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: ["client_brand", "need_right_now", "goal"],
  },
  offer_builder_v1: {
    systemPrompt: `You are the LV Branding Offer Builder Agent.\n\nGOAL: Translate "what they want" into package options with clear scope ladders, pricing logic, and deliverables the client can perceive as valuable.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Build a ladder: Foundation → Growth → Scale.\n- Separate outputs (assets) from outcomes (results).\n- Include optional add-ons that increase ROI.\n\nOUTPUT FORMAT:\nA) What the client is asking for (decoded)\nB) Recommended offer ladder (3 tiers with outcomes)\nC) Deliverables list per tier (assets + formats)\nD) Pricing logic (why priced this way; not hourly)\nE) Add-ons (2–5)\nF) What we need from the client (inputs/approvals)\nG) QA notes + assumptions\nH) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: ["what_they_want"],
  },
  proposal_scope_pricing_v1: {
    systemPrompt: `You are the LV Branding Proposal + Scope + Pricing Agent.\n\nGOAL: Produce a client-ready proposal section with scope, deliverables, investment, timeline, terms, and a value justification paragraph.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Present investment as a single number per package (avoid $0 lines).\n- Include Deliverables Summary + Next Steps to Start.\n- If payment terms are missing, default to 50% to start / 50% on delivery.\n\nOUTPUT FORMAT:\nA) Proposal Header (Client, Project, Objective, Investment options)\nB) Scope of Work (sections)\nC) Deliverables Summary (counts + formats)\nD) Timeline\nE) Usage License / Rights (clear + simple)\nF) Assumptions + Out-of-scope (short)\nG) Payment terms\nH) Value Justification Paragraph\nI) Next Steps (to kick off)\nJ) QA notes\nK) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: ["scope_or_deliverables"],
  },
  content_system_v1: {
    systemPrompt: `You are the LV Branding Content System Agent.\n\nGOAL: Create a 30-day content system for IG/TikTok + supporting posts based on strategy: pillars, hooks, scripts, CTAs, repurposing map.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Content must match the offer + audience buying intent.\n- Provide: 4 pillars, 12–20 hooks, 8–12 reel scripts, 30-day calendar.\n\nOUTPUT FORMAT:\nA) Content Strategy Snapshot (offer, audience, CTA, tone)\nB) Pillars (4) + messaging angles\nC) Hook Bank (12–20)\nD) Reel System (8–12 scripts: 15–30 sec + shots list + on-screen text)\nE) Post System (carousel ideas + static posts + captions framework)\nF) 30-day Calendar (what posts when + objective per post)\nG) Repurposing Map (reel → story → post → email)\nH) QA notes + assumptions\nI) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: [],
  },
  production_coordinator_v1: {
    systemPrompt: `You are the LV Branding Production Coordinator Agent.\n\nGOAL: Convert deliverables into a production plan: timeline, dependencies, asset list, shoot list, editing checklist, naming, handoff rules.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Must be operational and assign responsibilities.\n- Include Client Approval Gates.\n\nOUTPUT FORMAT:\nA) Production Overview\nB) Timeline (Week-by-week + milestones)\nC) Dependencies\nD) Asset Checklist (Client inputs + LV outputs)\nE) Shoot List / Capture Plan (if relevant)\nF) Post-Production Checklist (exports/formats)\nG) File Naming + Delivery Structure\nH) Approval Gates\nI) Risks + QA notes\nJ) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: ["deliverables"],
  },
  website_audit_rewrite_seo_v1: {
    systemPrompt: `You are the LV Branding Website Audit + Rewrite + SEO Agent.\n\nGOAL: Audit a website for clarity + conversion + SEO, then provide rewritten copy blocks and a prioritized fix plan.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Prioritize revenue: clarity → trust → offer → CTA → friction.\n- Provide quick wins + deeper fixes.\n- If keywords are missing, propose a starter keyword set.\n\nOUTPUT FORMAT:\nA) Website Snapshot\nB) Priority Fixes (Top 10)\nC) Conversion Rewrite (hero + key sections)\nD) Trust/Proof Plan\nE) On-page SEO (titles/meta, H1/H2, internal links, schema)\nF) Content opportunities (landing pages/blogs)\nG) Measurement plan\nH) QA notes + assumptions\nI) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: ["website_url"],
  },
  client_comms_v1: {
    systemPrompt: `You are the LV Branding Client Comms Agent.\n\nGOAL: Turn messy updates into clean, professional client communications: emails, agendas, recap notes, next steps.\n\nRULES:\n- Ask max 3 questions.\n- Keep concise, clear, action-driven.\n- Always end with: Decisions, Actions, Owners, Due Dates.\n\nOUTPUT FORMAT:\nA) Message type selected (Email / Agenda / Recap / Text)\nB) Draft (client-ready)\nC) Action Summary (Decisions, Actions, Owners, Due Dates)\nD) QA notes\nE) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON> (only if new info learned)`,
    requiredFields: ["raw_notes"],
  },
  project_manager_v1: {
    systemPrompt: `You are the LV Branding Project Manager Agent.\n\nGOAL: Convert meeting notes and project updates into a clear, trackable execution plan: tasks, owners, due dates, dependencies, risks, and next steps.\n\nRULES:\n- Follow AGENT OS — Rules.\n- Ask max 5 questions only if required to schedule/assign tasks.\n- If details are missing, proceed with assumptions and label them.\n- Always return a task list that is operational and measurable.\n- Always include a "Notion-style" meeting note output.\n- End with machine-readable project updates in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>.\n\nOUTPUT FORMAT:\nA) Project Status Snapshot\nB) Meeting Notes (Notion style) — Date, Attendees, Agenda, Notes, Decisions\nC) Action Items (Task | Owner | Due Date | Priority | Status | Dependencies | Notes)\nD) Milestones & Timeline (next 2–6 weeks)\nE) Risks / Blocks / Needs from Client\nF) Next Steps (next 24–72 hours)\nG) QA Notes\nH) Updated Brand Snapshot in <SNAPSHOT_JSON>...</SNAPSHOT_JSON>`,
    requiredFields: [],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Content block types accepted by Claude API
type TextBlock     = { type: "text"; text: string };
type ImageBlock    = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type DocumentBlock = { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
type ContentBlock  = TextBlock | ImageBlock | DocumentBlock;

interface AttachmentInput { name: string; type: string; data: string; }

/**
 * Build the user-message content for the Claude API.
 * When attachments are present the content becomes an array of typed blocks;
 * otherwise it stays a plain string (cheaper, no wrapping overhead).
 */
function buildUserContent(
  text: string,
  attachments: AttachmentInput[],
): string | ContentBlock[] {
  if (!attachments || attachments.length === 0) return text;

  const blocks: ContentBlock[] = [];

  for (const att of attachments) {
    if (att.type.startsWith("image/")) {
      blocks.push({
        type:   "image",
        source: { type: "base64", media_type: att.type, data: att.data },
      });
    } else if (att.type === "application/pdf") {
      blocks.push({
        type:   "document",
        source: { type: "base64", media_type: "application/pdf", data: att.data },
      });
    } else {
      // Plain text / CSV / JSON / Markdown — decode base64 and embed inline
      let decoded = "";
      try { decoded = atob(att.data); } catch { decoded = "[unreadable]"; }
      blocks.push({
        type: "text",
        text: `[Attached file: ${att.name}]\n\`\`\`\n${decoded.slice(0, 50_000)}\n\`\`\``,
      });
    }
  }

  if (text.trim()) blocks.push({ type: "text", text });
  return blocks;
}

/** Extract <SNAPSHOT_JSON>...</SNAPSHOT_JSON> from AI output */
function extractSnapshot(text: string): Record<string, unknown> {
  const match = text.match(/<SNAPSHOT_JSON>([\s\S]*?)<\/SNAPSHOT_JSON>/i);
  if (!match) return {};
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return {};
  }
}

/** Deep-merge two objects (b overrides a) */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const result = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof result[k] === "object" && !Array.isArray(result[k])) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Parse lettered sections (A) Title\ncontent … B) …) from output text */
function parseSections(text: string): { key: string; title: string; content: string }[] {
  // Remove snapshot block before parsing
  const cleaned = text.replace(/<SNAPSHOT_JSON>[\s\S]*?<\/SNAPSHOT_JSON>/gi, "").trim();
  const sectionRegex = /^([A-K])\)\s+(.+?)(?=\n[A-K]\)|$)/gms;
  const sections: { key: string; title: string; content: string }[] = [];
  let match;
  while ((match = sectionRegex.exec(cleaned)) !== null) {
    const [, key, rest] = match;
    const newline = rest.indexOf("\n");
    const title   = newline === -1 ? rest.trim() : rest.slice(0, newline).trim();
    const content = newline === -1 ? ""           : rest.slice(newline + 1).trim();
    sections.push({ key, title, content });
  }
  return sections;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
  // ── Auth: decode JWT manually (same pattern as skill-run — no SUPABASE_ANON_KEY needed) ──
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json({ error: "Unauthorized" }, 401);

  let userId: string | null = null;
  try {
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    userId = payload.sub ?? null;
  } catch { /* malformed token */ }
  if (!userId) return json({ error: "Unauthorized" }, 401);

  // Parse body
  let body: {
    orgId:               string;
    projectId:           string;
    agentId:             string;
    input:               string;
    languageControl?:    { language: string };
    mode?:               "create" | "revise";
    parentRunId?:        string;
    conversationHistory?: { role: "user" | "assistant"; content: string }[];
    attachments?:        AttachmentInput[];
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const {
    orgId, projectId, agentId, input, languageControl,
    mode = "create", parentRunId, conversationHistory = [],
    attachments = [],
  } = body;

  const hasAttachments = attachments.length > 0;
  if (!orgId || !projectId || !agentId || (!input && !hasAttachments)) {
    return json({ error: "Missing required fields: orgId, projectId, agentId, and input or attachments" }, 400);
  }

  const agent = AGENTS[agentId];
  if (!agent) return json({ error: `Unknown agent: ${agentId}` }, 400);

  // Service-role client for DB writes
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  // Load current brand snapshot
  const { data: project } = await db
    .from("projects")
    .select("name, client_name, description, marketing_context, brand_snapshot")
    .eq("id", projectId)
    .single();

  const currentSnapshot    = (project?.brand_snapshot    ?? {}) as Record<string, unknown>;
  const marketingContext   = (project?.marketing_context ?? {}) as Record<string, unknown>;

  // Build system prompt
  const lang = languageControl?.language ?? "EN";

  // ── Project identity block ──────────────────────────────────────────────────
  const projectLines: string[] = [];
  if (project?.name)        projectLines.push(`Project Name: ${project.name}`);
  if (project?.client_name) projectLines.push(`Client: ${project.client_name}`);
  if (project?.description) projectLines.push(`Description: ${project.description}`);
  const projectBlock = projectLines.length > 0
    ? `\n\nPROJECT:\n${projectLines.join("\n")}`
    : "";

  // ── Marketing context block (intake brief + AI-generated strategy) ─────────
  let marketingBlock = "";
  const intakeInputs = marketingContext.intake_inputs as Record<string, string> | undefined;
  const rawMarkdown  = marketingContext.raw_markdown  as string | undefined;

  if (intakeInputs && Object.keys(intakeInputs).length > 0) {
    const intakeLines = Object.entries(intakeInputs)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `  ${k.replace(/_/g, " ")}: ${v}`)
      .join("\n");
    marketingBlock += `\n\nCLIENT BRIEF (from intake form):\n${intakeLines}`;
  }
  if (rawMarkdown) {
    // Trim to first 2000 chars to keep context lean
    marketingBlock += `\n\nAI MARKETING CONTEXT (generated strategy doc):\n${rawMarkdown.slice(0, 2000)}${rawMarkdown.length > 2000 ? "\n[...truncated]" : ""}`;
  }

  // ── Brand snapshot block (accumulated intel from previous agent runs) ───────
  // Serialise snapshot, but cap at 3000 chars to avoid bloating the context
  const snapshotJson = JSON.stringify(currentSnapshot, null, 2);
  const snapshotBlock = Object.keys(currentSnapshot).length > 0
    ? `\n\nBRAND SNAPSHOT (accumulated from previous agent runs):\n${snapshotJson.slice(0, 3000)}${snapshotJson.length > 3000 ? "\n...}" : ""}`
    : "";

  const systemPrompt = [
    agent.systemPrompt,
    AGENT_OS_RULES,
    `LANGUAGE CONTROL: ${lang}`,
    projectBlock,
    marketingBlock,
    snapshotBlock,
  ].filter(Boolean).join("");

  // Build messages — cap history at last 10 turns to keep context lean,
  // then append the new user turn (which may contain file content blocks)
  const trimmedHistory = conversationHistory.slice(-10);
  const messages: { role: string; content: string | ContentBlock[] }[] = [
    ...trimmedHistory,
    { role: "user", content: buildUserContent(input, attachments) },
  ];

  // Create a pending run record
  const { data: runRecord, error: insertErr } = await db
    .from("agent_runs")
    .insert({
      org_id:             orgId,
      project_id:         projectId,
      agent_id:           agentId,
      agent_pack_version: AGENT_PACK_VER,
      input:              { text: input },
      mode,
      parent_run_id:      parentRunId ?? null,
      language_control:   { language: lang },
      status:             "running",
      model:              MODEL,
    })
    .select("id")
    .single();

  if (insertErr || !runRecord) {
    console.error("Failed to insert agent_run:", insertErr);
    return json({ error: "Failed to create run record" }, 500);
  }

  const runId = runRecord.id;

  // Call Claude API
  if (!CLAUDE_API_KEY) {
    await db.from("agent_runs").update({ status: "error", error: "CLAUDE_API_KEY not set" }).eq("id", runId);
    return json({ error: "Claude API key not configured" }, 500);
  }

  let outputFullText = "";
  let usage: Record<string, unknown> = {};

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 6000,
        system:     systemPrompt,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error ${claudeRes.status}: ${err}`);
    }

    const claudeData = await claudeRes.json() as {
      content: { type: string; text: string }[];
      usage:   { input_tokens: number; output_tokens: number };
    };

    outputFullText = claudeData.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    usage = {
      input_tokens:  claudeData.usage?.input_tokens ?? 0,
      output_tokens: claudeData.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("Claude error:", errMsg);
    await db.from("agent_runs").update({ status: "error", error: errMsg }).eq("id", runId);
    return json({ error: errMsg }, 500);
  }

  // Parse output — strip snapshot block from visible text first
  const cleanOutputText = outputFullText
    .replace(/<SNAPSHOT_JSON>[\s\S]*?<\/SNAPSHOT_JSON>/gi, "")
    .trim();

  const outputSections = parseSections(outputFullText);
  const snapshotDelta  = extractSnapshot(outputFullText);
  const merged         = Object.keys(snapshotDelta).length > 0
    ? deepMerge(currentSnapshot, snapshotDelta)
    : currentSnapshot;

  // Always stamp the real server-side date — Claude's knowledge cutoff can produce wrong dates
  const now = new Date();
  const realDate = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const newSnapshot: Record<string, unknown> = {
    ...merged,
    last_updated: realDate,
    prepared_by:  (merged.prepared_by as string | undefined) ?? "LV Branding",
  };

  // Update run record — store the clean text (snapshot block excluded)
  await db.from("agent_runs").update({
    output_full_text: cleanOutputText,
    output_sections:  outputSections,
    brand_snapshot:   newSnapshot,
    snapshot_delta:   snapshotDelta,
    status:           "completed",
    completed_at:     new Date().toISOString(),
    usage,
  }).eq("id", runId);

  // Update project's brand_snapshot
  if (Object.keys(snapshotDelta).length > 0) {
    await db.from("projects").update({ brand_snapshot: newSnapshot }).eq("id", projectId);
  }

  return json({
    runId,
    agentId,
    outputFullText:  cleanOutputText,
    outputSections,
    brandSnapshot:   newSnapshot,
    snapshotDelta,
    usage,
    status: "completed",
  });

  } catch (err) {
    // Safety net: always return CORS headers even on unexpected crashes
    const msg = err instanceof Error ? err.message : String(err);
    console.error("agent-run unhandled error:", msg);
    return json({ error: "Internal server error", detail: msg }, 500);
  }
});
