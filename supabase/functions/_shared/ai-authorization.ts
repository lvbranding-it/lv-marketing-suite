// Shared by both AI entry points. No trust is placed in decoded JWT claims.
export class AiAccessError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

interface AuthClient {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
}

export async function requireAiUser(client: AuthClient, authorization: string | null): Promise<string> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AiAccessError(401, "Unauthorized");
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error("Invalid session");
    return data.user.id;
  } catch {
    throw new AiAccessError(401, "Unauthorized");
  }
}

export function requireAiId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AiAccessError(400, `Invalid ${label}`);
  }
}

// A narrow structural interface keeps authorization testable without a runtime SDK.
interface Lookup {
  select(columns: string): Lookup;
  eq(column: string, value: string): Lookup;
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
}
interface Database { from(table: string): Lookup }

export async function requireAiOrganization(db: Database, userId: string, orgId: unknown, branchId?: unknown) {
  requireAiId(orgId, "organization");
  const { data: membership, error } = await db.from("team_members")
    .select("user_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (error || !membership) throw new AiAccessError(403, "Unauthorized organization");
  if (branchId !== undefined && branchId !== null) {
    requireAiId(branchId, "branch");
    const { data, error: branchError } = await db.from("org_branches")
      .select("id").eq("org_id", orgId).eq("id", branchId).maybeSingle();
    if (branchError || !data) throw new AiAccessError(403, "Unauthorized branch");
  }
}

export async function requireAiProject(db: Database, orgId: string, projectId: unknown, parentRunId?: unknown) {
  requireAiId(projectId, "project");
  const { data: project, error } = await db.from("projects")
    .select("name, client_name, description, marketing_context, brand_snapshot")
    .eq("org_id", orgId).eq("id", projectId).maybeSingle();
  if (error || !project) throw new AiAccessError(403, "Project unavailable");
  if (parentRunId !== undefined && parentRunId !== null) {
    requireAiId(parentRunId, "parent run");
    const { data, error: parentError } = await db.from("agent_runs")
      .select("id").eq("org_id", orgId).eq("project_id", projectId)
      .eq("id", parentRunId).maybeSingle();
    if (parentError || !data) throw new AiAccessError(403, "Parent run unavailable");
  }
  return project;
}
