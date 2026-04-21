import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  Users,
  Activity,
  Building2,
  Crown,
  UserCog,
  User,
  Mail,
  Clock,
  Trash2,
  RefreshCw,
  UserPlus,
  Loader2,
  ChevronDown,
  Settings2,
  Store,
  MapPin,
  Plus,
  Eye,
  CheckCircle2,
  Globe2,
  Megaphone,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage, type Language } from "@/hooks/useLanguage";
import { useOrg } from "@/hooks/useOrg";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatBranchLocalTime, getBranchFlag, useBranchUsageSummary } from "@/hooks/useBranches";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type MemberRole = "owner" | "admin" | "manager" | "member";

interface TeamMemberRow {
  org_id: string;
  user_id: string;
  role: MemberRole;
  invited_email: string | null;
  joined_at: string;
  invited_by?: string | null;
}

interface InvitationRow {
  id: string;
  org_id: string;
  invited_email: string;
  role: MemberRole;
  invited_by: string | null;
  token: string;
  accepted_at: string | null;
  cancelled_at?: string | null;
  created_at: string;
  expires_at: string;
  invited_by_role?: string | null;
}

interface ActivityRow {
  id: string;
  org_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type BranchStatus = "planning" | "active" | "paused" | "archived";
type BranchTeamRole = "regional_ceo" | "manager" | "crew";

interface BranchRow {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  country: string;
  country_flag: string | null;
  city: string | null;
  region: string;
  timezone: string;
  primary_language: Language;
  status: BranchStatus;
  hq_monitored: boolean;
  notification_banner: string | null;
  monthly_budget_cents: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface BranchFormState {
  name: string;
  code: string;
  country: string;
  countryFlag: string;
  city: string;
  timezone: string;
  primaryLanguage: Language;
  monthlyBudgetDollars: string;
  notificationBanner: string;
}

interface BranchTeamRow {
  branch_id: string;
  org_id: string;
  user_id: string;
  role: BranchTeamRole;
  assigned_by: string | null;
  assigned_at: string;
  invited_email: string | null;
  display_name: string | null;
}

interface BranchInvitationRow {
  id: string;
  org_id: string;
  branch_id: string;
  invited_email: string;
  invitee_name: string | null;
  role: BranchTeamRole;
  invited_by: string | null;
  token: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  expires_at: string;
}

interface BranchInviteDraft {
  email: string;
  name: string;
  role: BranchTeamRole;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleBadgeClass(role: MemberRole) {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "admin":
      return "bg-red-50 text-red-700 border-red-200";
    case "manager":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function RoleIcon({ role }: { role: MemberRole }) {
  switch (role) {
    case "owner":
      return <Crown size={11} className="mr-1 inline-block" />;
    case "admin":
      return <Shield size={11} className="mr-1 inline-block" />;
    case "manager":
      return <UserCog size={11} className="mr-1 inline-block" />;
    default:
      return <User size={11} className="mr-1 inline-block" />;
  }
}

function RoleBadge({ role }: { role: MemberRole }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium border rounded-full px-2 py-0.5 ${roleBadgeClass(role)}`}
    >
      <RoleIcon role={role} />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

function branchTeamRoleClass(role: BranchTeamRole) {
  switch (role) {
    case "regional_ceo":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "manager":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

const ACTION_LABELS: Record<string, string> = {
  edited_contact: "Edited contact",
  ran_research: "Ran AI research",
  drafted_campaign: "Drafted campaign",
  submitted_campaign: "Submitted campaign for approval",
  edited_project: "Edited project",
  removed_member: "Removed team member",
  invited_member: "Invited team member",
  accepted_invite: "Accepted invitation",
  created_contact: "Created contact",
  deleted_contact: "Deleted contact",
  created_project: "Created project",
  deleted_project: "Deleted project",
  sent_campaign: "Sent campaign",
  approved_campaign: "Approved campaign",
  created_branch: "Created branch",
  updated_branch_status: "Updated branch status",
};

type InviteMemberPayload = {
  org_id: string;
  email: string;
  role: MemberRole;
  inviter_name?: string;
  invitee_name?: string;
};

type InviteBranchMemberPayload = {
  org_id: string;
  branch_id: string;
  email: string;
  role: BranchTeamRole;
  inviter_name?: string;
  invitee_name?: string;
};

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function readFunctionError(response: Response) {
  const fallback = `Failed to send invitation (${response.status})`;
  const text = await response.text().catch(() => "");

  if (!text) return fallback;
  try {
    const body = JSON.parse(text);
    if (typeof body?.error === "string") return body.error;
    if (typeof body?.message === "string") return body.message;
  } catch {
    return text;
  }

  return fallback;
}

async function getInviteAccessToken() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("You're offline. Reconnect and try sending the invite again.");
  }

  let sessionResult;
  try {
    sessionResult = await supabase.auth.getSession();
  } catch (error) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("You're offline. Reconnect and try sending the invite again.");
    }

    const message = error instanceof Error ? error.message : "Unknown auth error";
    throw new Error(`Could not refresh your session: ${message}`);
  }

  if (sessionResult.error) {
    throw new Error(`Could not refresh your session: ${sessionResult.error.message}`);
  }

  if (!sessionResult.data.session?.access_token) {
    throw new Error("Your session expired. Please sign in again before sending an invite.");
  }

  return sessionResult.data.session.access_token;
}

function isExpiredSessionError(error: unknown) {
  return error instanceof Error && error.message.includes("session expired");
}

async function inviteMember(payload: InviteMemberPayload) {
  const accessToken = await getInviteAccessToken();

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_URL}/invite-member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("You're offline. Reconnect and try sending the invite again.");
    }

    throw new Error("Network changed while sending the invite. Check your connection and try again.");
  }

  if (!response.ok) {
    const message = await readFunctionError(response);
    if (response.status === 401) {
      throw new Error("Your session expired. Please sign in again before sending an invite.");
    }
    throw new Error(message);
  }

  return response.json().catch(() => ({ ok: true }));
}

async function inviteBranchMember(payload: InviteBranchMemberPayload) {
  const accessToken = await getInviteAccessToken();

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_URL}/invite-branch-member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("You're offline. Reconnect and try sending the branch invite again.");
    }

    throw new Error("Network changed while sending the branch invite. Check your connection and try again.");
  }

  if (!response.ok) {
    const message = await readFunctionError(response);
    if (response.status === 401) {
      throw new Error("Your session expired. Please sign in again before sending an invite.");
    }
    throw new Error(message);
  }

  return response.json().catch(() => ({ ok: true }));
}

function actionLabel(action: string, translate: (key: string) => string) {
  const translated = translate(`activity.${action}`);
  if (translated !== `activity.${action}`) return translated;
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { org, role, isBranchOnly } = useOrg();
  const perms = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "member">("member");
  const [activityPage, setActivityPage] = useState(0);
  const [featurePanelUserId, setFeaturePanelUserId] = useState<string | null>(null);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchInviteDrafts, setBranchInviteDrafts] = useState<Record<string, BranchInviteDraft>>({});
  const [branchForm, setBranchForm] = useState<BranchFormState>({
    name: "",
    code: "",
    country: "Mexico",
    countryFlag: "",
    city: "",
    timezone: "America/Mexico_City",
    primaryLanguage: "es",
    monthlyBudgetDollars: "",
    notificationBanner: "",
  });
  const { summary: branchUsageSummary } = useBranchUsageSummary(30);

  const initials = (
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    "U"
  )
    .slice(0, 2)
    .toUpperCase();

  // ── Team members query ──────────────────────────────────────────────────────
  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMemberRow[]>({
    queryKey: ["team_members", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("org_id", org.id);
      if (error) throw error;
      return (data ?? []) as TeamMemberRow[];
    },
    enabled: !!org && !isBranchOnly,
  });

  // ── Pending invitations query ───────────────────────────────────────────────
  const { data: invitations = [], isLoading: invitationsLoading } = useQuery<InvitationRow[]>({
    queryKey: ["invitations", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvitationRow[];
    },
    enabled: !!org && !isBranchOnly,
  });

  // ── Activity log query ──────────────────────────────────────────────────────
  const PAGE_SIZE = 25;
  const { data: activityRows = [], isLoading: activityLoading } = useQuery<ActivityRow[]>({
    queryKey: ["activity_log", org?.id, activityPage],
    queryFn: async () => {
      if (!org) return [];
      const from = activityPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    enabled: !!org && perms.canViewActivityLog,
  });

  // ── Branches query ─────────────────────────────────────────────────────────
  const { data: branches = [], isLoading: branchesLoading } = useQuery<BranchRow[]>({
    queryKey: ["org_branches", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("org_branches")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BranchRow[];
    },
    enabled: !!org,
  });

  const { data: branchTeamRows = [], isLoading: branchTeamLoading } = useQuery<BranchTeamRow[]>({
    queryKey: ["branch_team_members", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("branch_team_members")
        .select("*")
        .eq("org_id", org.id)
        .order("assigned_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BranchTeamRow[];
    },
    enabled: !!org,
  });

  const { data: branchInvitations = [], isLoading: branchInvitationsLoading } = useQuery<BranchInvitationRow[]>({
    queryKey: ["branch_invitations", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("branch_invitations")
        .select("*")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BranchInvitationRow[];
    },
    enabled: !!org && perms.canManageBranchTeam,
  });

  const [allActivity, setAllActivity] = useState<ActivityRow[]>([]);
  // Accumulate pages
  const displayedActivity =
    activityPage === 0 ? activityRows : [...allActivity, ...activityRows];

  // ── Add branch mutation ────────────────────────────────────────────────────
  const addBranchMutation = useMutation({
    mutationFn: async () => {
      if (!org || !user) throw new Error("No organization");
      const name = branchForm.name.trim();
      if (!name) throw new Error("Branch name is required");

      const payload = {
        org_id: org.id,
        name,
        code: branchForm.code.trim().toUpperCase() || null,
        country: branchForm.country.trim() || "Mexico",
        country_flag: branchForm.countryFlag.trim() || null,
        city: branchForm.city.trim() || null,
        region: "Latam",
        timezone: branchForm.timezone.trim() || "America/Mexico_City",
        primary_language: branchForm.primaryLanguage,
        notification_banner: branchForm.notificationBanner.trim() || null,
        monthly_budget_cents: Math.max(0, Math.round(Number(branchForm.monthlyBudgetDollars || 0) * 100)),
        status: "planning" as BranchStatus,
        hq_monitored: true,
        created_by: user.id,
      };

      const { data, error } = await supabase
        .from("org_branches")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      const branch = data as BranchRow;

      await (supabase as any).from("activity_log").insert({
        org_id: org.id,
        user_id: user.id,
        user_email: user.email,
        action: "created_branch",
        entity_type: "branch",
        entity_id: branch.id,
        entity_label: name,
        metadata: {
          country: payload.country,
          city: payload.city,
          code: payload.code,
          hq_monitored: true,
        },
      });

      return branch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_branches", org?.id] });
      queryClient.invalidateQueries({ queryKey: ["activity_log", org?.id] });
      toast({ description: t("branches.created") });
      setBranchDialogOpen(false);
      setBranchForm({
        name: "",
        code: "",
        country: "Mexico",
        countryFlag: "",
        city: "",
        timezone: "America/Mexico_City",
        primaryLanguage: "es",
        monthlyBudgetDollars: "",
        notificationBanner: "",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : t("branches.createFailed"),
      });
    },
  });

  // ── Update branch status mutation ──────────────────────────────────────────
  const updateBranchStatusMutation = useMutation({
    mutationFn: async ({ branch, status }: { branch: BranchRow; status: BranchStatus }) => {
      if (!org || !user) throw new Error("No organization");
      const { error } = await supabase
        .from("org_branches")
        .update({ status })
        .eq("org_id", org.id)
        .eq("id", branch.id);
      if (error) throw error;

      await (supabase as any).from("activity_log").insert({
        org_id: org.id,
        user_id: user.id,
        user_email: user.email,
        action: "updated_branch_status",
        entity_type: "branch",
        entity_id: branch.id,
        entity_label: branch.name,
        metadata: { status },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_branches", org?.id] });
      queryClient.invalidateQueries({ queryKey: ["activity_log", org?.id] });
      toast({ description: t("branches.statusUpdated") });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : t("branches.statusUpdateFailed"),
      });
    },
  });

  const updateBranchBudgetMutation = useMutation({
    mutationFn: async ({ branch, monthlyBudgetCents }: { branch: BranchRow; monthlyBudgetCents: number }) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase
        .from("org_branches")
        .update({ monthly_budget_cents: monthlyBudgetCents })
        .eq("org_id", org.id)
        .eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_branches", org?.id] });
      toast({ description: "Branch budget updated." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to update branch budget",
      });
    },
  });

  const updateBranchProfileMutation = useMutation({
    mutationFn: async ({
      branch,
      values,
    }: {
      branch: BranchRow;
      values: Partial<Pick<BranchRow, "city" | "country_flag" | "notification_banner">>;
    }) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase
        .from("org_branches")
        .update(values)
        .eq("org_id", org.id)
        .eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_branches", org?.id] });
      toast({ description: t("branches.profileUpdated") });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : t("branches.profileUpdateFailed"),
      });
    },
  });

  const updateBranchTeamRoleMutation = useMutation({
    mutationFn: async ({ branchId, userId, role }: { branchId: string; userId: string; role: BranchTeamRole }) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase
        .from("branch_team_members")
        .update({ role })
        .eq("org_id", org.id)
        .eq("branch_id", branchId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch_team_members", org?.id] });
      toast({ description: t("branches.teamUpdated") });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : t("branches.teamUpdateFailed"),
      });
    },
  });

  const removeBranchTeamMemberMutation = useMutation({
    mutationFn: async ({ branchId, userId }: { branchId: string; userId: string }) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase
        .from("branch_team_members")
        .delete()
        .eq("org_id", org.id)
        .eq("branch_id", branchId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch_team_members", org?.id] });
      toast({ description: t("branches.teamRemoved") });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : t("branches.teamRemoveFailed"),
      });
    },
  });

  // ── Remove member mutation ──────────────────────────────────────────────────
  const removeMemberMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("org_id", org.id)
        .eq("user_id", targetUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast({ description: "Team member removed." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to remove member",
      });
    },
  });

  // ── Update role mutation ────────────────────────────────────────────────────
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      if (!org) throw new Error("No org");
      const { error } = await supabase
        .from("team_members")
        .update({ role: newRole } as never)
        .eq("org_id", org.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members", org?.id] });
      toast({ description: "Role updated successfully." });
    },
    onError: (err) => toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to update role" }),
  });

  // ── Update feature access mutation ─────────────────────────────────────────
  const updateFeatureAccessMutation = useMutation({
    mutationFn: async ({ userId, feature, value }: { userId: string; feature: string; value: boolean }) => {
      if (!org) throw new Error("No org");
      // First fetch current feature_access
      const { data: current } = await supabase
        .from("team_members")
        .select("feature_access")
        .eq("org_id", org.id)
        .eq("user_id", userId)
        .single();
      const existing = ((current as any)?.feature_access as Record<string, boolean>) ??
        { campaigns: true, contacts: true, projects: true, skills: true, intake: true };
      const updated = { ...existing, [feature]: value };
      const { error } = await supabase
        .from("team_members")
        .update({ feature_access: updated } as never)
        .eq("org_id", org.id)
        .eq("user_id", userId);
      if (error) throw error;
      return updated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team_members", org?.id] }),
    onError: () => toast({ variant: "destructive", description: "Failed to update access" }),
  });

  // ── Cancel invitation mutation ──────────────────────────────────────────────
  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ cancelled_at: new Date().toISOString() } as never)
        .eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ description: "Invitation cancelled." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to cancel invitation",
      });
    },
  });

  // ── Resend invitation mutation ──────────────────────────────────────────────
  const resendInviteMutation = useMutation({
    mutationFn: async (invite: InvitationRow) => {
      if (!org) throw new Error("No organization");
      const inviterName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "A team member";
      await inviteMember({
        org_id: org.id,
        email: invite.invited_email.trim().toLowerCase(),
        role: invite.role,
        inviter_name: inviterName,
      });
    },
    onSuccess: (_data, invite) => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ description: `Invitation resent to ${invite.invited_email}` });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to resend invitation",
      });
      if (isExpiredSessionError(err)) {
        signOut().finally(() => navigate("/auth", { replace: true }));
      }
    },
  });

  // ── Send invite mutation ────────────────────────────────────────────────────
  const sendInviteMutation = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error("No organization");
      const email = inviteEmail.trim().toLowerCase();
      if (!email) throw new Error("Email address is required");

      const inviterName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "A team member";
      await inviteMember({
        org_id: org.id,
        email,
        role: inviteRole,
        inviter_name: inviterName,
        invitee_name: inviteeName.trim() || undefined,
      });
      return email;
    },
    onSuccess: (email) => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ description: `Invitation sent to ${email}` });
      setInviteEmail("");
      setInviteeName("");
      setInviteRole("member");
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to send invitation",
      });
      if (isExpiredSessionError(err)) {
        signOut().finally(() => navigate("/auth", { replace: true }));
      }
    },
  });

  const sendBranchInviteMutation = useMutation({
    mutationFn: async ({ branch, draft }: { branch: BranchRow; draft: BranchInviteDraft }) => {
      if (!org) throw new Error("No organization");
      const email = draft.email.trim().toLowerCase();
      if (!email) throw new Error("Email address is required");

      const inviterName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "A team member";
      await inviteBranchMember({
        org_id: org.id,
        branch_id: branch.id,
        email,
        role: draft.role,
        inviter_name: inviterName,
        invitee_name: draft.name.trim() || undefined,
      });

      return { branch, email };
    },
    onSuccess: ({ branch, email }) => {
      queryClient.invalidateQueries({ queryKey: ["branch_invitations", org?.id] });
      toast({ description: `Branch invitation sent to ${email}` });
      setBranchInviteDrafts((current) => ({
        ...current,
        [branch.id]: { email: "", name: "", role: "crew" },
      }));
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to send branch invitation",
      });
      if (isExpiredSessionError(err)) {
        signOut().finally(() => navigate("/auth", { replace: true }));
      }
    },
  });

  const cancelBranchInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from("branch_invitations")
        .update({ cancelled_at: new Date().toISOString() } as never)
        .eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch_invitations", org?.id] });
      toast({ description: "Branch invitation cancelled." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to cancel branch invitation",
      });
    },
  });

  const resendBranchInviteMutation = useMutation({
    mutationFn: async ({ branch, invite }: { branch: BranchRow; invite: BranchInvitationRow }) => {
      if (!org) throw new Error("No organization");
      const inviterName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "A team member";
      await inviteBranchMember({
        org_id: org.id,
        branch_id: branch.id,
        email: invite.invited_email.trim().toLowerCase(),
        role: invite.role,
        inviter_name: inviterName,
        invitee_name: invite.invitee_name ?? undefined,
      });
    },
    onSuccess: (_data, { invite }) => {
      queryClient.invalidateQueries({ queryKey: ["branch_invitations", org?.id] });
      toast({ description: `Branch invitation resent to ${invite.invited_email}` });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to resend branch invitation",
      });
      if (isExpiredSessionError(err)) {
        signOut().finally(() => navigate("/auth", { replace: true }));
      }
    },
  });

  // ── Permission checks for remove ───────────────────────────────────────────
  function canRemoveMember(member: TeamMemberRow) {
    if (!user) return false;
    if (member.user_id === user.id) return false;
    if (member.role === "owner") return false;
    if (perms.isAdmin) return true;
    if (perms.isManager) {
      return member.invited_by === user.id;
    }
    return false;
  }

  function memberDisplayName(userId: string) {
    const branchMember = branchTeamRows.find((row) => row.user_id === userId);
    const member = members.find((row) => row.user_id === userId);
    if (userId === user?.id) {
      return (
        branchMember?.display_name ??
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        userId.slice(0, 8)
      );
    }
    if (branchMember?.display_name) return branchMember.display_name;
    if (branchMember?.invited_email) return branchMember.invited_email;
    return member?.invited_email ?? `${userId.slice(0, 8)}...`;
  }

  function currentBranchRole(branchId: string) {
    return branchTeamRows.find((row) => row.branch_id === branchId && row.user_id === user?.id)?.role ?? null;
  }

  function branchInviteRoleOptions(branchId: string) {
    const localRole = currentBranchRole(branchId);
    if (perms.isAdmin) return branchTeamRoleOptions;
    if (localRole === "regional_ceo") return ["manager", "crew"] as BranchTeamRole[];
    if (localRole === "manager") return ["crew"] as BranchTeamRole[];
    return [] as BranchTeamRole[];
  }

  function canManageBranchTeamMember(branchId: string, targetRole: BranchTeamRole) {
    if (perms.isAdmin) return true;
    const localRole = currentBranchRole(branchId);
    if (localRole === "regional_ceo") return targetRole !== "regional_ceo";
    if (localRole === "manager") return targetRole === "crew";
    return false;
  }

  function canManageBranchTeam(branchId: string) {
    return branchInviteRoleOptions(branchId).length > 0;
  }

  const displayRole = role as MemberRole | null;
  const branchStatusOptions: BranchStatus[] = ["planning", "active", "paused", "archived"];
  const branchTeamRoleOptions: BranchTeamRole[] = ["regional_ceo", "manager", "crew"];
  const canViewBranchGovernance = perms.isAdmin;

  return (
    <AppShell>
      <Header title={t("settings.title")} />

      <div className="p-3 sm:p-6 max-w-4xl mx-auto">
        <Tabs defaultValue="account">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="account">{t("settings.account")}</TabsTrigger>
            <TabsTrigger value="organization">{t("settings.organization")}</TabsTrigger>
            <TabsTrigger value="branches">{t("settings.branches")}</TabsTrigger>
            {!isBranchOnly && (
              <TabsTrigger value="team">{t("settings.team")}</TabsTrigger>
            )}
            {perms.canViewActivityLog && (
              <TabsTrigger value="activity">{t("settings.activity")}</TabsTrigger>
            )}
          </TabsList>

          {/* ── Account Tab ── */}
          <TabsContent value="account" className="mt-6 space-y-6">
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {(user?.user_metadata?.full_name as string | undefined) ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {displayRole && (
                  <RoleBadge role={displayRole} />
                )}
                {!displayRole && perms.branchRole && (
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      branchTeamRoleClass(perms.branchRole)
                    )}
                  >
                    {t(`branches.role.${perms.branchRole}`)}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
              {t("settings.profileHelp")}
            </div>
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe2 size={15} />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t("settings.languagePreference")}
                </span>
              </div>
              <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{t("language.english")}</SelectItem>
                  <SelectItem value="es">{t("language.spanish")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("settings.languageHelp")}</p>
            </div>
          </TabsContent>

          {/* ── Organization Tab ── */}
          <TabsContent value="organization" className="mt-6 space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Building2 size={15} />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t("settings.organization")}
                </span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("settings.name")}</Label>
                <p className="text-sm font-medium mt-0.5">{org?.name ?? "—"}</p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground">{t("settings.organizationId")}</Label>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 break-all">
                  {org?.id ?? "—"}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ── Branches Tab ── */}
          <TabsContent value="branches" className="mt-6 space-y-6">
            {canViewBranchGovernance && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Store size={15} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold">{t("branches.title")}</h3>
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {t("branches.subtitle")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="w-fit gap-1.5 border-primary/30 text-primary">
                      <Eye size={12} />
                      {t("branches.hqMonitored")}
                    </Badge>
                    <Button
                      size="sm"
                      className="gap-1.5 text-white hover:opacity-90"
                      style={{ backgroundColor: "#CB2039" }}
                      onClick={() => setBranchDialogOpen(true)}
                    >
                      <Plus size={13} />
                      {t("branches.add")}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" />
                    <span>{t("branches.hqMonitoredHelp")}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {branchesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t("branches.loading")}
                </div>
              ) : branches.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <Store size={24} className="mx-auto mb-2 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">{t("branches.addFirst")}</p>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {branches.map((branch) => {
                    const usage = branchUsageSummary.find((item) => item.branch.id === branch.id);
                    const usageCents = usage?.costCents ?? 0;
                    const budgetCents = branch.monthly_budget_cents ?? 0;
                    const budgetPct = budgetCents > 0
                      ? Math.min(100, Math.round((usageCents / budgetCents) * 100))
                      : 0;
                    const branchTeam = branchTeamRows.filter((row) => row.branch_id === branch.id);
                    const branchPendingInvites = branchInvitations.filter((invite) => invite.branch_id === branch.id);
                    const canManageTeam = canManageBranchTeam(branch.id);
                    const allowedBranchInviteRoles = branchInviteRoleOptions(branch.id);
                    const inviteDraft = branchInviteDrafts[branch.id] ?? {
                      email: "",
                      name: "",
                      role: allowedBranchInviteRoles[0] ?? "crew",
                    };
                    const branchFlag = getBranchFlag(branch);
                    const localTime = formatBranchLocalTime(branch.timezone, language === "es" ? "es-ES" : "en-US");

                    return (
                    <div
                      key={branch.id}
                      className="rounded-lg border border-border bg-card p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {branchFlag && (
                              <span className="text-lg leading-none" aria-hidden="true">
                                {branchFlag}
                              </span>
                            )}
                            <h4 className="truncate text-sm font-semibold">{branch.name}</h4>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {branch.code || t("branches.noCode")}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin size={11} />
                            <span className="truncate">
                              {[branch.city || t("branches.noCity"), branch.country].join(", ")}
                            </span>
                          </div>
                        </div>
                        {canViewBranchGovernance && (
                          <Badge variant="outline" className="shrink-0 gap-1 border-primary/30 text-primary">
                            <Eye size={11} />
                            {t("branches.hqMonitored")}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">{t("branches.region")}</p>
                          <p className="mt-0.5 font-medium">{branch.region}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">{t("branches.city")}</p>
                          {perms.isAdmin ? (
                            <Input
                              defaultValue={branch.city ?? ""}
                              placeholder={t("branches.noCity")}
                              className="mt-1 h-7 px-2 text-xs"
                              onBlur={(event) => {
                                const nextCity = event.target.value.trim() || null;
                                if (nextCity !== (branch.city ?? null)) {
                                  updateBranchProfileMutation.mutate({
                                    branch,
                                    values: { city: nextCity },
                                  });
                                }
                              }}
                            />
                          ) : (
                            <p className="mt-0.5 font-medium">{branch.city || t("branches.noCity")}</p>
                          )}
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">{t("branches.primaryLanguage")}</p>
                          <p className="mt-0.5 font-medium">
                            {t(`branches.language.${branch.primary_language}`)}
                          </p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">{t("branches.localTime")}</p>
                          <p className="mt-0.5 font-medium">{localTime}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">{t("branches.countryFlag")}</p>
                          {perms.isAdmin ? (
                            <Input
                              defaultValue={branch.country_flag ?? ""}
                              maxLength={8}
                              placeholder={branchFlag || "Flag"}
                              className="mt-1 h-7 px-2 text-xs"
                              onBlur={(event) => {
                                const nextFlag = event.target.value.trim() || null;
                                if (nextFlag !== (branch.country_flag ?? null)) {
                                  updateBranchProfileMutation.mutate({
                                    branch,
                                    values: { country_flag: nextFlag },
                                  });
                                }
                              }}
                            />
                          ) : (
                            <p className="mt-0.5 font-medium">{branchFlag || "—"}</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Megaphone size={13} className="text-primary" />
                          <p className="text-xs font-semibold">{t("branches.notificationBanner")}</p>
                        </div>
                        {perms.isAdmin ? (
                          <Textarea
                            defaultValue={branch.notification_banner ?? ""}
                            placeholder={t("branches.notificationPlaceholder")}
                            className="min-h-[72px] resize-none text-xs"
                            onBlur={(event) => {
                              const nextBanner = event.target.value.trim() || null;
                              if (nextBanner !== (branch.notification_banner ?? null)) {
                                updateBranchProfileMutation.mutate({
                                  branch,
                                  values: { notification_banner: nextBanner },
                                });
                              }
                            }}
                          />
                        ) : branch.notification_banner ? (
                          <p className="text-xs leading-relaxed text-foreground">
                            {branch.notification_banner}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t("branches.noNotification")}</p>
                        )}
                      </div>

                      {canViewBranchGovernance && (
                        <div className="rounded-md border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                30-day AI usage
                              </p>
                              <p className="text-sm font-semibold">
                                ${(usageCents / 100).toFixed(2)}
                                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                                  {usage?.units ?? 0} tokens
                                </span>
                              </p>
                            </div>
                            <div className="w-28">
                              <Label className="sr-only" htmlFor={`budget-${branch.id}`}>
                                Monthly AI budget
                              </Label>
                              <Input
                                id={`budget-${branch.id}`}
                                type="number"
                                min={0}
                                step="1"
                                defaultValue={budgetCents ? String(Math.round(budgetCents / 100)) : ""}
                                placeholder="Budget"
                                className="h-8 text-xs"
                                onBlur={(event) => {
                                  const nextCents = Math.max(0, Math.round(Number(event.target.value || 0) * 100));
                                  if (nextCents !== budgetCents) {
                                    updateBranchBudgetMutation.mutate({
                                      branch,
                                      monthlyBudgetCents: nextCents,
                                    });
                                  }
                                }}
                              />
                            </div>
                          </div>
                          {budgetCents > 0 && (
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  budgetPct >= 90 ? "bg-destructive" : "bg-primary"
                                )}
                                style={{ width: `${budgetPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-md border border-border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Users size={13} className="text-muted-foreground" />
                            <p className="text-xs font-semibold">{t("branches.team")}</p>
                          </div>
                          {branchTeamLoading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                        </div>

                        {branchTeam.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("branches.noTeam")}</p>
                        ) : (
                          <div className="space-y-2">
                            {branchTeam.map((teamMember) => (
                              <div
                                key={`${teamMember.branch_id}-${teamMember.user_id}`}
                                className="flex items-center justify-between gap-2 rounded-md bg-muted/35 px-2 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">
                                    {memberDisplayName(teamMember.user_id)}
                                  </p>
                                  <span
                                    className={cn(
                                      "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                      branchTeamRoleClass(teamMember.role)
                                    )}
                                  >
                                    {t(`branches.role.${teamMember.role}`)}
                                  </span>
                                </div>
                                {canManageTeam && canManageBranchTeamMember(branch.id, teamMember.role) && (
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Select
                                      value={teamMember.role}
                                      disabled={updateBranchTeamRoleMutation.isPending}
                                      onValueChange={(value) =>
                                        updateBranchTeamRoleMutation.mutate({
                                          branchId: branch.id,
                                          userId: teamMember.user_id,
                                          role: value as BranchTeamRole,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-8 w-32 text-xs" aria-label={t("common.status")}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {branchInviteRoleOptions(branch.id).map((roleOption) => (
                                          <SelectItem key={roleOption} value={roleOption}>
                                            {t(`branches.role.${roleOption}`)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      disabled={removeBranchTeamMemberMutation.isPending}
                                      onClick={() =>
                                        removeBranchTeamMemberMutation.mutate({
                                          branchId: branch.id,
                                          userId: teamMember.user_id,
                                        })
                                      }
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {canManageTeam && (
                          <div className="space-y-2 rounded-md border border-dashed border-border p-2">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                value={inviteDraft.name}
                                placeholder="Name"
                                className="h-8 text-xs"
                                onChange={(event) =>
                                  setBranchInviteDrafts((current) => ({
                                    ...current,
                                    [branch.id]: { ...inviteDraft, name: event.target.value },
                                  }))
                                }
                              />
                              <Input
                                type="email"
                                value={inviteDraft.email}
                                placeholder="email@company.com"
                                className="h-8 text-xs"
                                onChange={(event) =>
                                  setBranchInviteDrafts((current) => ({
                                    ...current,
                                    [branch.id]: { ...inviteDraft, email: event.target.value },
                                  }))
                                }
                              />
                              <Select
                                value={inviteDraft.role}
                                onValueChange={(value) =>
                                  setBranchInviteDrafts((current) => ({
                                    ...current,
                                    [branch.id]: { ...inviteDraft, role: value as BranchTeamRole },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 text-xs" aria-label={t("branches.team")}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {allowedBranchInviteRoles.map((roleOption) => (
                                    <SelectItem key={roleOption} value={roleOption}>
                                      {t(`branches.role.${roleOption}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-full gap-1.5 text-xs"
                                disabled={sendBranchInviteMutation.isPending || !inviteDraft.email.trim()}
                                onClick={() => sendBranchInviteMutation.mutate({ branch, draft: inviteDraft })}
                              >
                                {sendBranchInviteMutation.isPending ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <UserPlus size={12} />
                                )}
                                {t("settings.sendInvite")}
                              </Button>
                            </div>
                          </div>
                        )}

                        {canManageTeam && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                                {t("settings.pendingInvitations")}
                              </p>
                              {branchInvitationsLoading && (
                                <Loader2 size={11} className="animate-spin text-muted-foreground" />
                              )}
                            </div>
                            {branchPendingInvites.length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t("settings.noPendingInvitations")}</p>
                            ) : (
                              <div className="space-y-1.5">
                                {branchPendingInvites.map((invite) => (
                                  <div
                                    key={invite.id}
                                    className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium">{invite.invited_email}</p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {t(`branches.role.${invite.role}`)} · {format(new Date(invite.expires_at), "MMM d")}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        disabled={resendBranchInviteMutation.isPending}
                                        onClick={() => resendBranchInviteMutation.mutate({ branch, invite })}
                                      >
                                        <RefreshCw size={11} />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                        disabled={cancelBranchInviteMutation.isPending}
                                        onClick={() => cancelBranchInviteMutation.mutate(invite.id)}
                                      >
                                        <Trash2 size={11} />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground">{t("branches.timezone")}</p>
                          <p className="text-xs font-medium">{branch.timezone}</p>
                        </div>
                        {canViewBranchGovernance ? (
                          <Select
                            value={branch.status}
                            disabled={updateBranchStatusMutation.isPending}
                            onValueChange={(value) =>
                              updateBranchStatusMutation.mutate({
                                branch,
                                status: value as BranchStatus,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-32 text-xs" aria-label={t("common.status")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {branchStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {t(`branches.status.${status}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Team Tab ── */}
          {!isBranchOnly && (
          <TabsContent value="team" className="mt-6 space-y-8">
            {/* HQ Team Members */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("settings.hqTeam")}</h3>
              </div>

              {membersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t("settings.loadingMembers")}
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("settings.noMembers")}</p>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => {
                    const displayName =
                      (member as any).profiles?.full_name ??
                      member.invited_email ??
                      member.user_id.slice(0, 8) + "...";
                    const avatarInitials = displayName.slice(0, 2).toUpperCase();
                    const memberRole = member.role as MemberRole;

                    return (
                      <div key={`${member.org_id}-${member.user_id}`}>
                        <div className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                                {avatarInitials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-medium truncate">
                                  {displayName}
                                </p>
                                {member.user_id === user?.id && (
                                  <span className="text-[10px] text-muted-foreground">(You)</span>
                                )}
                              </div>
                              {perms.isAdmin && member.user_id !== user?.id && member.role !== "owner" ? (
                                <Select
                                  value={member.role}
                                  onValueChange={(r) => updateRoleMutation.mutate({ userId: member.user_id, newRole: r })}
                                >
                                  <SelectTrigger className="h-7 text-xs w-28 border-border mt-0.5">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="member">Member</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <RoleBadge role={memberRole} />
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {perms.isAdmin && member.user_id !== user?.id && member.role !== "owner" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-7 w-7",
                                  featurePanelUserId === member.user_id
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                                onClick={() =>
                                  setFeaturePanelUserId((prev) =>
                                    prev === member.user_id ? null : member.user_id
                                  )
                                }
                              >
                                <Settings2 size={13} />
                              </Button>
                            )}

                            {canRemoveMember(member) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                disabled={removeMemberMutation.isPending}
                                onClick={() => removeMemberMutation.mutate(member.user_id)}
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </div>

                        {featurePanelUserId === member.user_id && (
                          <div className="mt-2 ml-9 p-3 bg-muted/40 rounded-lg border border-border space-y-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              {t("settings.featureAccess")}
                            </p>
                            {[
                              { key: "campaigns", label: "Campaigns", icon: "📧" },
                              { key: "contacts",  label: "Contacts",  icon: "👥" },
                              { key: "projects",  label: "Projects",  icon: "📁" },
                              { key: "skills",    label: "Skills",    icon: "⚡" },
                              { key: "intake",    label: "Intake",    icon: "📋" },
                            ].map(({ key, label, icon }) => {
                              const fa = ((member as any).feature_access as Record<string, boolean>) ?? {};
                              const enabled = fa[key] !== false; // default true
                              return (
                                <div key={key} className="flex items-center justify-between">
                                  <span className="text-xs text-foreground">{icon} {label}</span>
                                  <button
                                    onClick={() =>
                                      updateFeatureAccessMutation.mutate({
                                        userId: member.user_id,
                                        feature: key,
                                        value: !enabled,
                                      })
                                    }
                                    className={cn(
                                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                                      enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                                        enabled ? "translate-x-4" : "translate-x-0.5"
                                      )}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Pending Invitations */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("settings.pendingInvitations")}</h3>
              </div>

              {invitationsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Loading…
                </div>
              ) : invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("settings.noPendingInvitations")}</p>
              ) : (
                <div className="space-y-2">
                  {invitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{invite.invited_email}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <RoleBadge role={invite.role as MemberRole} />
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock size={10} />
                            Sent {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Expires {format(new Date(invite.expires_at), "MMM d")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={resendInviteMutation.isPending}
                          onClick={() => resendInviteMutation.mutate(invite)}
                        >
                          <RefreshCw size={11} />
                          Resend
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                          disabled={cancelInviteMutation.isPending}
                          onClick={() => cancelInviteMutation.mutate(invite.id)}
                        >
                          <Trash2 size={11} />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invite Form */}
            {perms.canInviteMembers && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <UserPlus size={14} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{t("settings.inviteTeamMember")}</h3>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-name">
                        Name <span className="text-muted-foreground text-xs">(optional)</span>
                      </Label>
                      <Input
                        id="invite-name"
                        type="text"
                        placeholder="e.g. Maria Garcia"
                        value={inviteeName}
                        onChange={(e) => setInviteeName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="invite-email" className="text-xs">
                        Email address
                      </Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Role</Label>
                      {perms.isAdmin ? (
                        <Select
                          value={inviteRole}
                          onValueChange={(v) => setInviteRole(v as "manager" | "member")}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value="member" disabled>
                          <SelectTrigger className="h-9 text-sm opacity-70">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {inviteRole === "manager" && (
                        <p className="text-xs text-muted-foreground">
                          Can invite Members, approve campaigns, view all contacts and projects.
                        </p>
                      )}
                      {inviteRole === "member" && (
                        <p className="text-xs text-muted-foreground">
                          Can draft campaigns, view contacts, collaborate on projects. Activity is tracked.
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={() => sendInviteMutation.mutate()}
                      disabled={sendInviteMutation.isPending || !inviteEmail.trim()}
                      style={{ backgroundColor: "#CB2039" }}
                      className="text-white hover:opacity-90 gap-2"
                    >
                      {sendInviteMutation.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <UserPlus size={14} />
                      )}
                      {t("settings.sendInvite")}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* ── Branch Teams (HQ view) ── */}
            {perms.isAdmin && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Store size={14} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{t("settings.branchTeams")}</h3>
                    {branchTeamRows.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        — {t("settings.branchTeamsMeta", {
                          members: branchTeamRows.length,
                          branches: branches.filter((b) =>
                            branchTeamRows.some((r) => r.branch_id === b.id)
                          ).length,
                        })}
                      </span>
                    )}
                  </div>

                  {branchTeamLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      {t("settings.loadingMembers")}
                    </div>
                  ) : branchTeamRows.length === 0 && branchInvitations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.noBranchTeamsYet")}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {branches.map((branch) => {
                        const branchTeam = branchTeamRows.filter((row) => row.branch_id === branch.id);
                        const branchPendingCount = branchInvitations.filter((inv) => inv.branch_id === branch.id).length;
                        if (branchTeam.length === 0 && branchPendingCount === 0) return null;
                        const branchFlag = getBranchFlag(branch);

                        return (
                          <div key={branch.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                            {/* Branch header */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {branchFlag && (
                                <span className="text-base leading-none" aria-hidden="true">
                                  {branchFlag}
                                </span>
                              )}
                              <h4 className="text-xs font-semibold">{branch.name}</h4>
                              <span className="text-[10px] text-muted-foreground">{branch.country}</span>
                              {branchPendingCount > 0 && (
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1.5 text-[9px] border-amber-200 text-amber-700 bg-amber-50"
                                >
                                  {t("settings.pendingInvitesCount", { count: branchPendingCount })}
                                </Badge>
                              )}
                            </div>

                            {/* Branch members */}
                            {branchTeam.length === 0 ? (
                              <p className="text-xs text-muted-foreground pl-1">
                                {t("settings.noActiveMembersYet")}
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {branchTeam.map((teamMember) => {
                                  const displayName =
                                    teamMember.display_name ||
                                    teamMember.invited_email ||
                                    `${teamMember.user_id.slice(0, 8)}…`;
                                  const avatarInitials = displayName.slice(0, 2).toUpperCase();

                                  return (
                                    <div
                                      key={`${teamMember.branch_id}-${teamMember.user_id}`}
                                      className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-1.5"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Avatar className="h-6 w-6 shrink-0">
                                          <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
                                            {avatarInitials}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium truncate">{displayName}</p>
                                          <span
                                            className={cn(
                                              "inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium",
                                              branchTeamRoleClass(teamMember.role)
                                            )}
                                          >
                                            {t(`branches.role.${teamMember.role}`)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <Select
                                          value={teamMember.role}
                                          disabled={updateBranchTeamRoleMutation.isPending}
                                          onValueChange={(value) =>
                                            updateBranchTeamRoleMutation.mutate({
                                              branchId: branch.id,
                                              userId: teamMember.user_id,
                                              role: value as BranchTeamRole,
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-7 w-28 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {branchTeamRoleOptions.map((roleOption) => (
                                              <SelectItem key={roleOption} value={roleOption}>
                                                {t(`branches.role.${roleOption}`)}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                          disabled={removeBranchTeamMemberMutation.isPending}
                                          onClick={() =>
                                            removeBranchTeamMemberMutation.mutate({
                                              branchId: branch.id,
                                              userId: teamMember.user_id,
                                            })
                                          }
                                        >
                                          <Trash2 size={12} />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>
          )}

          {/* ── Activity Tab ── */}
          {perms.canViewActivityLog && (
            <TabsContent value="activity" className="mt-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">Activity Log</h3>
              </div>

              {activityLoading && activityPage === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 size={14} className="animate-spin" />
                  Loading activity…
                </div>
              ) : displayedActivity.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No activity recorded yet.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">
                            When
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            User
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            Action
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">
                            Entity
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedActivity.map((row, i) => (
                          <tr
                            key={row.id}
                            className={`border-b border-border last:border-0 ${
                              i % 2 === 0 ? "bg-card" : "bg-muted/20"
                            }`}
                          >
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                            </td>
                            <td className="px-3 py-2 truncate max-w-[120px]">
                              {row.user_email ?? row.user_id?.slice(0, 8) ?? "—"}
                            </td>
                            <td className="px-3 py-2">{actionLabel(row.action, t)}</td>
                            <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell truncate max-w-[140px]">
                              {row.entity_label ?? row.entity_type ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activityRows.length === PAGE_SIZE && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      disabled={activityLoading}
                      onClick={() => {
                        setAllActivity(displayedActivity);
                        setActivityPage((p) => p + 1);
                      }}
                    >
                      {activityLoading ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                      Load more
                    </Button>
                  )}
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("branches.add")}</DialogTitle>
            <DialogDescription>
              {t("branches.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name" className="text-xs">
                {t("branches.branchName")}
              </Label>
              <Input
                id="branch-name"
                value={branchForm.name}
                placeholder={t("branches.namePlaceholder")}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-code" className="text-xs">
                {t("branches.code")}
              </Label>
              <Input
                id="branch-code"
                value={branchForm.code}
                placeholder={t("branches.codePlaceholder")}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, code: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-country" className="text-xs">
                {t("branches.country")}
              </Label>
              <Input
                id="branch-country"
                value={branchForm.country}
                placeholder={t("branches.countryPlaceholder")}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, country: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-country-flag" className="text-xs">
                {t("branches.countryFlag")}
              </Label>
              <Input
                id="branch-country-flag"
                value={branchForm.countryFlag}
                maxLength={8}
                placeholder={t("branches.countryFlagPlaceholder")}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, countryFlag: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-city" className="text-xs">
                {t("branches.city")}
              </Label>
              <Input
                id="branch-city"
                value={branchForm.city}
                placeholder={t("branches.cityPlaceholder")}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, city: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-timezone" className="text-xs">
                {t("branches.timezone")}
              </Label>
              <Input
                id="branch-timezone"
                value={branchForm.timezone}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, timezone: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("branches.primaryLanguage")}</Label>
              <Select
                value={branchForm.primaryLanguage}
                onValueChange={(value) =>
                  setBranchForm((current) => ({
                    ...current,
                    primaryLanguage: value as Language,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">{t("branches.language.es")}</SelectItem>
                  <SelectItem value="en">{t("branches.language.en")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-budget" className="text-xs">
                Monthly AI budget ($)
              </Label>
              <Input
                id="branch-budget"
                type="number"
                min={0}
                step="1"
                value={branchForm.monthlyBudgetDollars}
                placeholder="0 = no limit"
                onChange={(event) =>
                  setBranchForm((current) => ({
                    ...current,
                    monthlyBudgetDollars: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="branch-notification" className="text-xs">
                {t("branches.notificationBanner")}
              </Label>
              <Textarea
                id="branch-notification"
                value={branchForm.notificationBanner}
                placeholder={t("branches.notificationPlaceholder")}
                className="resize-none"
                onChange={(event) =>
                  setBranchForm((current) => ({
                    ...current,
                    notificationBanner: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" />
              <span>{t("branches.hqMonitoredHelp")}</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBranchDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="gap-2 text-white hover:opacity-90"
              style={{ backgroundColor: "#CB2039" }}
              disabled={addBranchMutation.isPending || !branchForm.name.trim()}
              onClick={() => addBranchMutation.mutate()}
            >
              {addBranchMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {t("branches.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
