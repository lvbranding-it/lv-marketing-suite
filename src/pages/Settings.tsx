import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import type { TeamMember } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "member"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

export default function Settings() {
  const { user } = useAuth();
  const { org, role } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  });

  // Load team members
  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["team_members", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("org_id", org.id);
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    enabled: !!org,
  });

  const inviteMutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      if (!org) throw new Error("No organization");
      const { error } = await supabase.from("invitations").insert({
        org_id: org.id,
        invited_email: values.email,
        role: values.role,
        invited_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      inviteForm.reset();
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast({ description: "Invitation created! Share the invite link with your team member." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to send invite",
      });
    },
  });

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  return (
    <AppShell>
      <Header title="Settings" />

      <div className="p-3 sm:p-6 max-w-2xl mx-auto">
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="mt-6 space-y-6">
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">
                  {user?.user_metadata?.full_name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <Badge variant="outline" className="text-[10px] mt-1">
                  {role ?? "member"}
                </Badge>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
              To update your name or email, go to your Supabase account settings.
            </div>
          </TabsContent>

          {/* Organization Tab */}
          <TabsContent value="organization" className="mt-6 space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div>
                <Label className="text-xs">Organization Name</Label>
                <p className="text-sm font-medium mt-1">{org?.name ?? "—"}</p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs">Organization ID</Label>
                <p className="text-xs text-muted-foreground font-mono mt-1">{org?.id ?? "—"}</p>
              </div>
            </div>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="mt-6 space-y-6">
            {/* Current members */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Team Members</h3>
              {membersLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={`${member.org_id}-${member.user_id}`}
                      className="bg-card border border-border rounded-lg px-3 py-2 flex items-center justify-between flex-wrap gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary/20 text-primary text-[11px]">
                            {(member.invited_email ?? member.user_id).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-medium">
                            {member.user_id === user?.id ? "You" : (member.invited_email ?? member.user_id.slice(0, 8) + "...")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                      {isOwnerOrAdmin && member.user_id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invite form */}
            {isOwnerOrAdmin && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Invite Team Member</h3>
                <form
                  onSubmit={inviteForm.handleSubmit((v) => inviteMutation.mutate(v))}
                  className="space-y-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Email address</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="colleague@company.com"
                      {...inviteForm.register("email")}
                    />
                    {inviteForm.formState.errors.email && (
                      <p className="text-xs text-destructive">
                        {inviteForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select
                      defaultValue="member"
                      onValueChange={(v) =>
                        inviteForm.setValue("role", v as "admin" | "member")
                      }
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? (
                      <Loader2 size={14} className="mr-2 animate-spin" />
                    ) : (
                      <UserPlus size={14} className="mr-2" />
                    )}
                    Send Invite
                  </Button>
                </form>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
