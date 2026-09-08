import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as portalAdvisor from "./portal-advisor";
import * as authorization from "./ai-authorization";

// Execute the real endpoint handlers with only network/database boundaries mocked.
function endpoint(
  name: string,
  validSession = true,
  member = false,
  advisorAllowed = false,
) {
  let handler!: (request: Request) => Promise<Response>;
  const calls: string[] = [];
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: validSession ? { id: "alice" } : null },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      calls.push(name);
      return {
        data: advisorAllowed ? { role: "ambassador", first_name: "Ana" } : null,
        error: null,
      };
    },
    from: (table: string) => {
      calls.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data:
            table === "team_members" && member ? { user_id: "alice" } : null,
          error: null,
        }),
      };
      return query;
    },
  };
  const source = readFileSync(
    new URL(`../${name}/index.ts`, import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const provider = vi.fn(async (_url: string, _options: RequestInit) => {
    if (!advisorAllowed) throw new Error("Provider must not be called");
    return new Response(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Start with discovery."}}\n\ndata: {"type":"message_stop"}\n\n',
    );
  });
  const requireModule = (id: string) => {
    if (id.includes("http/server"))
      return {
        serve: (fn: typeof handler) => {
          handler = fn;
        },
      };
    if (id.includes("supabase-js")) return { createClient: () => db };
    if (id.includes("portal-advisor")) return portalAdvisor;
    if (id.includes("ai-authorization")) return authorization;
    throw new Error(`Unexpected import ${id}`);
  };
  new Function("require", "exports", "Deno", "fetch", compiled)(
    requireModule,
    {},
    { env: { get: () => "configured" } },
    provider,
  );
  return { handler, calls, provider };
}

const orgId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const body = {
  orgId,
  projectId,
  agentId: "lead_intel_v1",
  input: "Help",
  skillSystemPrompt: "Help",
  userMessage: "Help",
};
function request(payload: object = body) {
  return new Request("https://example.test", {
    method: "POST",
    headers: {
      Authorization: "Bearer forged-or-valid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

describe.each(["agent-run", "skill-run"])("%s request boundary", (name) => {
  it("rejects an unverified session before any database or provider access", async () => {
    const app = endpoint(name, false);
    expect((await app.handler(request())).status).toBe(401);
    expect(app.calls).toEqual([]);
    expect(app.provider).not.toHaveBeenCalled();
  });
  it("rejects nonmembers before context lookup, writes or provider spending", async () => {
    const app = endpoint(name);
    expect((await app.handler(request())).status).toBe(403);
    expect(app.calls).toEqual(["team_members"]);
    expect(app.provider).not.toHaveBeenCalled();
  });
  it("rejects missing organization scope", async () => {
    const app = endpoint(name, true, true);
    expect(
      (await app.handler(request({ ...body, orgId: undefined }))).status,
    ).toBe(400);
    expect(app.calls).toEqual([]);
    expect(app.provider).not.toHaveBeenCalled();
  });
});

it("agent-run rejects an unavailable project before run insertion or provider access", async () => {
  const app = endpoint("agent-run", true, true);
  expect((await app.handler(request())).status).toBe(403);
  expect(app.calls).toEqual(["team_members", "projects"]);
  expect(app.provider).not.toHaveBeenCalled();
});

it("standalone advisor uses only portal membership and no lead tables", async () => {
  const app = endpoint("skill-run", true, false, true);
  const response = await app.handler(
    request({ mode: "portal_advisor", orgId, userMessage: "Help me prepare" }),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toContain(
    "Remember, Ana, we are Strategy First. Always.",
  );
  expect(app.calls).toEqual(["portal_advisor_session"]);
  expect(app.provider).toHaveBeenCalledOnce();
});
it("standalone advisor rejects attached context before provider access", async () => {
  const app = endpoint("skill-run", true, false, true);
  expect(
    (
      await app.handler(
        request({
          mode: "portal_advisor",
          orgId,
          userMessage: "Help",
          leadId: projectId,
        }),
      )
    ).status,
  ).toBe(400);
  expect(app.provider).not.toHaveBeenCalled();
});
it("standalone advisor denies inactive or missing portal access", async () => {
  const app = endpoint("skill-run");
  expect(
    (
      await app.handler(
        request({ mode: "portal_advisor", orgId, userMessage: "Help" }),
      )
    ).status,
  ).toBe(403);
  expect(app.provider).not.toHaveBeenCalled();
});


it("grounds advisor requests in reviewed website content without internal deliverable instructions", async () => {
 const app = endpoint("skill-run", true, false, true);
 const response = await app.handler(request({mode:"portal_advisor",orgId,userMessage:"What services do we offer?",language:"es"}));
 await response.text();
 const payload = JSON.parse(app.provider.mock.calls[0][1].body as string);
 expect(payload.system).toContain(portalAdvisor.ADVISOR_BRAND_CONTEXT);
 expect(payload.system).toContain(portalAdvisor.AMBASSADOR_TRAINING_CONTEXT);
 expect(payload.system).toContain(portalAdvisor.AMBASSADOR_COMMISSION_CONTEXT);
 expect(payload.system).toContain("Respond in Spanish");
 expect(payload.system).not.toContain("will be used directly in client-facing deliverables");
 expect(app.calls).toEqual(["portal_advisor_session"]);
});
