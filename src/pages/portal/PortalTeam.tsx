import { useState, type FormEvent } from "react";
import { Copy, Mail, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  usePortalMembers,
  usePortalInvitations,
  usePortalCommand,
  type PortalInvitation,
} from "@/hooks/usePortal";
import type { PortalMember } from "@/lib/portal/types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const control = "h-10 rounded-md border bg-white px-3 text-sm";

export default function PortalTeam({
  org,
  preview,
}: {
  org: string;
  preview: boolean;
}) {
  const { t, language } = useLanguage();
  const p = (key: string) => t(`portal.${key}`);
  const members = usePortalMembers(org, !preview);
  const invitations = usePortalInvitations(org, preview);
  const command = usePortalCommand();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteToEdit, setInviteToEdit] = useState<PortalInvitation | null>(
    null,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ambassador");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<PortalMember | null>(null);
  const [removing, setRemoving] = useState<PortalMember | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<PortalInvitation | null>(
    null,
  );

  const run = async (action: () => Promise<void>) => {
    if (preview) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (caught) {
      setError(
        p(
          (caught as { code?: string }).code === "P0429"
            ? "rateLimited"
            : "error",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const openInvitation = (invitation?: PortalInvitation) => {
    setInviteToEdit(invitation ?? null);
    setName(invitation?.display_name ?? "");
    setEmail(invitation?.invited_email ?? "");
    setRole(invitation?.role ?? "ambassador");
    setLink("");
    setError("");
    setShowInvite(true);
  };

  const deliverInvitation = async (
    invitation: PortalInvitation | undefined,
    values: { email: string; name: string; role: string },
  ) => {
    const { data, error: deliveryError } = await supabase.functions.invoke(
      "portal-send-invitation",
      {
        body: {
          action: invitation ? "replace" : "create",
          orgId: org,
          invitationId: invitation?.id,
          email: values.email,
          name: values.name,
          role: values.role,
        },
      },
    );
    if (deliveryError || !data?.invitationUrl)
      throw deliveryError ?? new Error("Delivery failed");
    await invitations.refetch();
    setLink(data.invitationUrl);
    setNotice(p(data.emailSent ? "inviteEmailed" : "inviteEmailFallback"));
  };

  const submitInvitation = (event: FormEvent) => {
    event.preventDefault();
    void run(() =>
      deliverInvitation(inviteToEdit ?? undefined, { email, name, role }),
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{p("team")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {p("teamHelp")}
          </p>
        </div>
        <Button className="gap-2" onClick={() => openInvitation()}>
          <Plus size={16} />
          {p("inviteRepresentative")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <div className="rounded-xl border bg-white divide-y">
        {members.isError ? (
          <p role="alert" className="p-5">
            {p("error")}
          </p>
        ) : (
          (members.data ?? []).map((member) => (
            <div
              key={member.user_id}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="font-medium">
                {member.display_name}
                <p className="text-sm font-normal text-muted-foreground">
                  {p(member.role)} ·{" "}
                  {p(member.active ? "activeMember" : "inactiveMember")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setEditing({ ...member })}
                >
                  <Pencil size={14} />
                  {p("editRepresentative")}
                </Button>
                {member.active && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-destructive"
                    onClick={() => setRemoving(member)}
                  >
                    <Trash2 size={14} />
                    {p("removeRepresentative")}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
        {!members.isLoading && !members.data?.length && (
          <p className="p-6 text-muted-foreground">{p("noMembers")}</p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{p("invitations")}</h2>
        <div className="rounded-xl border bg-white divide-y">
          {invitations.isError ? (
            <p role="alert" className="p-5">
              {p("error")}
            </p>
          ) : (
            (invitations.data ?? []).map((invitation) => {
              const state = invitation.accepted_at
                ? "accepted"
                : invitation.cancelled_at
                  ? "cancelled"
                  : new Date(invitation.expires_at) < new Date()
                    ? "expired"
                    : "pendingInvite";
              const replaceable =
                state === "pendingInvite" || state === "expired";
              return (
                <div
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div>
                    <p className="font-medium">{invitation.display_name}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {invitation.invited_email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p(invitation.role)} · {p(state)} ·{" "}
                      {new Date(invitation.expires_at).toLocaleDateString(
                        language,
                      )}
                    </p>
                    {invitation.last_sent_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p("lastEmailed")}{" "}
                        {new Date(invitation.last_sent_at).toLocaleString(
                          language,
                        )}
                      </p>
                    )}
                  </div>
                  {replaceable && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={busy}
                        onClick={() => openInvitation(invitation)}
                      >
                        <Pencil size={14} />
                        {p("editInvitation")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={busy}
                        onClick={() => {
                          openInvitation(invitation);
                          void run(() =>
                            deliverInvitation(invitation, {
                              email: invitation.invited_email,
                              name: invitation.display_name,
                              role: invitation.role,
                            }),
                          );
                        }}
                      >
                        <RotateCw size={14} />
                        {p("resendInvitation")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-destructive"
                        disabled={busy}
                        onClick={() => setDeletingInvite(invitation)}
                      >
                        <Trash2 size={14} />
                        {p("deleteInvitation")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!invitations.isLoading && !invitations.data?.length && (
            <p className="p-6 text-muted-foreground">{p("noInvitations")}</p>
          )}
        </div>
      </section>

      <Dialog
        open={showInvite}
        onOpenChange={(open) => {
          setShowInvite(open);
          if (!open) setLink("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {p(inviteToEdit ? "editInvitation" : "inviteRepresentative")}
            </DialogTitle>
            <DialogDescription>
              {p(inviteToEdit ? "replaceInviteHelp" : "inviteLinkHelp")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {link ? (
            <div className="space-y-4">
              <p className="text-sm">{notice}</p>
              <Input aria-label={p("invitationLink")} readOnly value={link} />
              <Button
                className="gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setNotice(p("copied"));
                  } catch {
                    setError(p("copyManually"));
                  }
                }}
              >
                <Copy size={16} />
                {p("copyLink")}
              </Button>
            </div>
          ) : (
            <form onSubmit={submitInvitation} className="space-y-4">
              <label className="grid gap-2 text-sm">
                {p("displayName")}
                <Input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {p("email")}
                <Input
                  required
                  type="email"
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {p("profileRole")}
                <select
                  className={control}
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  {["ambassador", "business_developer", "staff"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {p(value)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={busy || preview}
                  className="gap-2"
                >
                  <Mail size={15} />
                  {p(inviteToEdit ? "saveAndResend" : "createAndSend")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p("editRepresentative")}</DialogTitle>
            <DialogDescription>{p("deactivateHelp")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await command("portal_set_member", {
                    p_org: org,
                    p_user: editing.user_id,
                    p_role: editing.role,
                    p_name: editing.display_name,
                    p_active: editing.active,
                  });
                  setEditing(null);
                  setNotice(p("representativeUpdated"));
                });
              }}
            >
              <label className="grid gap-2 text-sm">
                {p("displayName")}
                <Input
                  required
                  maxLength={120}
                  value={editing.display_name}
                  onChange={(event) =>
                    setEditing({ ...editing, display_name: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm">
                {p("profileRole")}
                <select
                  className={control}
                  value={editing.role}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      role: event.target.value as PortalMember["role"],
                    })
                  }
                >
                  {["ambassador", "business_developer", "staff"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {p(value)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(event) =>
                    setEditing({ ...editing, active: event.target.checked })
                  }
                />
                {p("activeMember")}
              </label>
              <DialogFooter>
                <Button type="submit" disabled={busy || preview}>
                  {p("saveChanges")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p("removeRepresentative")}</DialogTitle>
            <DialogDescription>
              {p("removeRepresentativeHelp")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {p("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || preview}
              onClick={() =>
                void run(async () => {
                  if (!removing) return;
                  await command("portal_set_member", {
                    p_org: org,
                    p_user: removing.user_id,
                    p_role: removing.role,
                    p_name: removing.display_name,
                    p_active: false,
                  });
                  setRemoving(null);
                  setNotice(p("representativeRemoved"));
                })
              }
            >
              {p("removeAccess")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletingInvite}
        onOpenChange={(open) => {
          if (!open) setDeletingInvite(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p("deleteInvitation")}</DialogTitle>
            <DialogDescription>{p("deleteInvitationHelp")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeletingInvite(null)}
            >
              {p("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || preview}
              onClick={() =>
                void run(async () => {
                  if (!deletingInvite) return;
                  await command("portal_delete_invitation", {
                    p_id: deletingInvite.id,
                  });
                  setDeletingInvite(null);
                  setNotice(p("invitationDeleted"));
                })
              }
            >
              {p("deleteInvitation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
