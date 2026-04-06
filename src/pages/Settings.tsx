import { useState } from "react";
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
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useAuth();
  const { org, role } = useOrg();
  const perms = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "member">("member");
  const [activityPage, setActivityPage] = useState(0);
  const [featurePanelUserId, setFeaturePanelUserId] = useState<string | null>(null);

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
    enabled: !!org,
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
    enabled: !!org,
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

  const [allActivity, setAllActivity] = useState<ActivityRow[]>([]);
  // Accumulate pages
  const displayedActivity =
    activityPage === 0 ? activityRows : [...allActivity, ...activityRows];

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
      const { error } = await supabase.functions.invoke("invite-member", {
        body: {
          org_id: org.id,
          email: invite.invited_email,
          role: invite.role,
          inviter_name: inviterName,
        },
      });
      if (error) throw error;
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
    },
  });

  // ── Send invite mutation ────────────────────────────────────────────────────
  const sendInviteMutation = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error("No organization");
      const inviterName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "A team member";
      const { error } = await supabase.functions.invoke("invite-member", {
        body: {
          org_id: org.id,
          email: inviteEmail,
          role: inviteRole,
          inviter_name: inviterName,
          invitee_name: inviteeName || undefined,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ description: `Invitation sent to ${inviteEmail}` });
      setInviteEmail("");
      setInviteeName("");
      setInviteRole("member");
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to send invitation",
      });
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

  const displayRole = role as MemberRole | null;

  return (
    <AppShell>
      <Header title="Settings" />

      <div className="p-3 sm:p-6 max-w-2xl mx-auto">
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            {perms.canViewActivityLog && (
              <TabsTrigger value="activity">Activity</TabsTrigger>
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
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
              To update your name or email, contact your workspace administrator.
            </div>
          </TabsContent>

          {/* ── Organization Tab ── */}
          <TabsContent value="organization" className="mt-6 space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Building2 size={15} />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Organization
                </span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <p className="text-sm font-medium mt-0.5">{org?.name ?? "—"}</p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground">Organization ID</Label>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 break-all">
                  {org?.id ?? "—"}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ── Team Tab ── */}
          <TabsContent value="team" className="mt-6 space-y-8">
            {/* Team Members */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">Team Members</h3>
              </div>

              {membersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Loading members…
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
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
                              Feature Access
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
                <h3 className="text-sm font-semibold">Pending Invitations</h3>
              </div>

              {invitationsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Loading…
                </div>
              ) : invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invitations.</p>
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
                    <h3 className="text-sm font-semibold">Invite Team Member</h3>
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
                      Send Invite
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

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
                            <td className="px-3 py-2">{actionLabel(row.action)}</td>
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
    </AppShell>
  );
}
