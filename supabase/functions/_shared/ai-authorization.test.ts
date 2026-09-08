import { describe, expect, it, vi } from "vitest";
import { requireAiUser, requireAiOrganization, requireAiProject } from "./ai-authorization";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const run = "44444444-4444-4444-8444-444444444444";
const branch = "55555555-5555-4555-8555-555555555555";
type Row = Record<string, unknown>;

// Execute filters against mixed-tenant records to catch omitted scope predicates.
function database(tables: Record<string, Row[]>, fail = false) {
  return {
    from: vi.fn((table: string) => {
      const filters: [string, string][] = [];
      const query = {
        select: (_columns: string) => query,
        eq: (column: string, value: string) => { filters.push([column, value]); return query; },
        maybeSingle: async () => ({
          data: fail ? null : tables[table]?.find(row => filters.every(([key, value]) => row[key] === value)) ?? null,
          error: fail ? new Error("Database unavailable") : null,
        }),
      };
      return query;
    }),
  };
}

describe("verified AI identity", () => {
  it("uses the auth server identity rather than an unverified token subject", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
    expect(await requireAiUser({ auth: { getUser } }, "Bearer token")).toBe("verified-user");
    expect(getUser).toHaveBeenCalledWith("token");
  });

  it.each([null, "", "Basic token", "Bearer ", "Bearer two tokens"])("rejects missing/malformed credentials: %s", async header => {
    const getUser = vi.fn();
    await expect(requireAiUser({ auth: { getUser } }, header)).rejects.toMatchObject({ status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each(["forged", "expired", "revoked"])("rejects %s sessions rejected by Auth", async token => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error(token) });
    await expect(requireAiUser({ auth: { getUser } }, `Bearer ${token}`)).rejects.toMatchObject({ status: 401 });
  });

  it("fails closed when Auth is unavailable", async () => {
    const getUser = vi.fn().mockRejectedValue(new Error("Offline"));
    await expect(requireAiUser({ auth: { getUser } }, "Bearer token")).rejects.toMatchObject({ status: 401 });
  });
});

describe("AI organization authorization", () => {
  const tables = { team_members: [{ org_id: org, user_id: "alice" }], org_branches: [{ id: branch, org_id: otherOrg }] };
  it("allows existing internal membership", async () => {
    await expect(requireAiOrganization(database(tables), "alice", org)).resolves.toBeUndefined();
  });
  it.each([["bob", org], ["alice", otherOrg]])("rejects another user or organization", async (user, scope) => {
    await expect(requireAiOrganization(database(tables), user, scope)).rejects.toMatchObject({ status: 403 });
  });
  it.each([undefined, null, "", {}, "invalid"])("requires explicit valid organization scope", async scope => {
    await expect(requireAiOrganization(database(tables), "alice", scope)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects billing usage to another organization's branch", async () => {
    await expect(requireAiOrganization(database(tables), "alice", org, branch)).rejects.toMatchObject({ status: 403 });
  });
  it("allows a branch within the authorized organization", async () => {
    await expect(requireAiOrganization(database({ ...tables, org_branches: [{ id: branch, org_id: org }] }), "alice", org, branch)).resolves.toBeUndefined();
  });
  it("fails closed on membership lookup errors", async () => {
    await expect(requireAiOrganization(database(tables, true), "alice", org)).rejects.toMatchObject({ status: 403 });
  });
});

describe("AI project and parent-run isolation", () => {
  it("returns context only for a project in the authorized organization", async () => {
    const row = { id: project, org_id: org, name: "Authorized project" };
    await expect(requireAiProject(database({ projects: [row] }), org, project)).resolves.toEqual(row);
  });
  it("rejects a valid project ID belonging to another organization", async () => {
    await expect(requireAiProject(database({ projects: [{ id: project, org_id: otherOrg }] }), org, project)).rejects.toMatchObject({ status: 403 });
  });
  it.each([
    { id: run, org_id: otherOrg, project_id: project },
    { id: run, org_id: org, project_id: otherOrg },
  ])("rejects parent-run links outside the requested project scope", async parent => {
    const db = database({ projects: [{ id: project, org_id: org }], agent_runs: [parent] });
    await expect(requireAiProject(db, org, project, run)).rejects.toMatchObject({ status: 403 });
  });
  it("allows a parent run in the same organization and project", async () => {
    const db = database({ projects: [{ id: project, org_id: org }], agent_runs: [{ id: run, org_id: org, project_id: project }] });
    await expect(requireAiProject(db, org, project, run)).resolves.toBeDefined();
  });
});
