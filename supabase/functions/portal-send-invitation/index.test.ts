import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const orgId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";

function app(
  options: {
    authenticated?: boolean;
    authorized?: boolean;
    sendgridStatus?: number;
    sendgridThrows?: boolean;
  } = {},
) {
  const authenticated = options.authenticated ?? true;
  const authorized = options.authorized ?? true;
  let handler!: (request: Request) => Promise<Response>;
  const rpc = vi.fn(async (name: string) => {
    if (name === "portal_mark_invitation_sent")
      return { data: null, error: null };
    if (!authorized) return { data: null, error: { code: "42501" } };
    return {
      data: [{ invitation_id: invitationId, token: "a".repeat(64) }],
      error: null,
    };
  });
  const clients = [
    {
      auth: {
        getUser: async () => ({
          data: { user: authenticated ? { id: "admin" } : null },
          error: null,
        }),
      },
    },
    { rpc },
  ];
  const createClient = vi.fn(() => clients.shift());
  const sendgrid = vi.fn(async () => {
    if (options.sendgridThrows) throw new Error("Network unavailable");
    return new Response("", { status: options.sendgridStatus ?? 202 });
  });
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const requireModule = (id: string) => {
    if (id.includes("http/server"))
      return {
        serve: (fn: typeof handler) => {
          handler = fn;
        },
      };
    if (id.includes("supabase-js")) return { createClient };
    throw new Error(`Unexpected import ${id}`);
  };
  const env: Record<string, string> = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SENDGRID_API_KEY: "sendgrid-key",
    PORTAL_PUBLIC_URL: "https://marketing.lvbranding.com",
    SENDGRID_FROM_EMAIL: "admin@lvbranding.com",
    SENDGRID_FROM_NAME: "LV Branding",
  };
  new Function("require", "exports", "Deno", "fetch", compiled)(
    requireModule,
    {},
    { env: { get: (key: string) => env[key] } },
    sendgrid,
  );
  const request = (body: object) =>
    new Request("https://edge.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return { handler, request, rpc, sendgrid };
}

const payload = {
  action: "create",
  orgId,
  email: "ambassador@example.test",
  name: "Ana",
  role: "ambassador",
};

describe("portal invitation email", () => {
  it("creates, emails and marks a server-generated invitation", async () => {
    const test = app();
    const response = await test.handler(test.request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      invitationId,
      invitationUrl: `https://marketing.lvbranding.com/portal-invite#invite=${"a".repeat(64)}`,
      emailSent: true,
    });
    const message = JSON.parse(test.sendgrid.mock.calls[0][1].body as string);
    expect(message.personalizations[0].to[0].email).toBe(payload.email);
    expect(message.content[0].value).toContain("Open your invitation");
    expect(test.rpc.mock.calls.map((call) => call[0])).toEqual([
      "portal_create_invitation",
      "portal_mark_invitation_sent",
    ]);
  });

  it("rejects unauthenticated and unauthorized requests before email", async () => {
    const unauthenticated = app({ authenticated: false });
    expect(
      (await unauthenticated.handler(unauthenticated.request(payload))).status,
    ).toBe(401);
    expect(unauthenticated.sendgrid).not.toHaveBeenCalled();
    const unauthorized = app({ authorized: false });
    expect(
      (await unauthorized.handler(unauthorized.request(payload))).status,
    ).toBe(403);
    expect(unauthorized.sendgrid).not.toHaveBeenCalled();
  });

  it("returns a manual-copy fallback when SendGrid rejects delivery", async () => {
    const test = app({ sendgridStatus: 500 });
    const response = await test.handler(test.request(payload));
    expect(response.status).toBe(200);
    expect((await response.json()).emailSent).toBe(false);
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns the secure manual-copy fallback after a SendGrid network error", async () => {
    const test = app({ sendgridThrows: true });
    const response = await test.handler(test.request(payload));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.emailSent).toBe(false);
    expect(body.invitationUrl).toMatch(/^https:\/\/marketing\.lvbranding\.com/);
  });

  it("rejects unknown fields and malformed recipient data", async () => {
    const test = app();
    expect(
      (
        await test.handler(
          test.request({ ...payload, invitationUrl: "https://evil.test" }),
        )
      ).status,
    ).toBe(400);
    expect(test.sendgrid).not.toHaveBeenCalled();
  });
});
