import { useState, type FormEvent } from "react";
import { Copy, Plus, UserCog } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  usePortalMembers,
  usePortalInvitations,
  usePortalCommand,
} from "@/hooks/usePortal";
import { portalInvitationUrl } from "@/lib/portal/invitations";
import type { PortalMember } from "@/lib/portal/types";
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
  const p = (k: string) => t(`portal.${k}`);
  const members = usePortalMembers(org, !preview),
    invites = usePortalInvitations(org, preview),
    command = usePortalCommand();
  const [showInvite, setShowInvite] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("ambassador");
  const [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<PortalMember | null>(null);
  const run = async (action: () => Promise<void>) => {
    if (preview) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        p((e as { code?: string }).code === "P0429" ? "rateLimited" : "error"),
      );
    } finally {
      setBusy(false);
    }
  };
  const createInvite = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const data = await command("portal_create_invitation", {
        p_org: org,
        p_email: email,
        p_name: name,
        p_role: role,
      });
      setLink(portalInvitationUrl(window.location.origin, data[0].token));
      setNotice(p("inviteCreated"));
    });
  };
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{p("team")}</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            {p("teamHelp")}
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setShowInvite(true);
            setLink("");
            setEmail("");
            setName("");
            setRole("ambassador");
            setError("");
          }}
        >
          <Plus size={16} />
          {p("inviteRepresentative")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-800 text-sm">
          {notice}
        </p>
      )}
      <div className="rounded-xl border bg-white divide-y">
        {members.isError ? (
          <p role="alert" className="p-5">
            {p("error")}
          </p>
        ) : (
          (members.data ?? []).map((m) => (
            <div
              key={m.user_id}
              className="p-5 flex flex-wrap gap-4 items-center justify-between"
            >
              <div className="font-medium">
                {m.display_name}
                <p className="text-sm text-muted-foreground font-normal">
                  {p(m.role)} ·{" "}
                  {p(m.active ? "activeMember" : "inactiveMember")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setEditing({ ...m });
                  setError("");
                }}
              >
                <UserCog size={15} />
                {p("manageAccess")}
              </Button>
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
          {invites.isError ? (
            <p role="alert" className="p-5">
              {p("error")}
            </p>
          ) : (
            (invites.data ?? []).map((i) => {
              const state = i.accepted_at
                ? "accepted"
                : i.cancelled_at
                  ? "cancelled"
                  : new Date(i.expires_at) < new Date()
                    ? "expired"
                    : "pendingInvite";
              return (
                <div
                  key={i.id}
                  className="p-5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">{i.display_name}</p>
                    <p className="text-sm text-muted-foreground break-all">
                      {i.invited_email}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p(i.role)} · {p(state)} ·{" "}
                      {new Date(i.expires_at).toLocaleDateString(language)}
                    </p>
                  </div>
                  {state === "pendingInvite" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await command("portal_cancel_invitation", {
                            p_id: i.id,
                          });
                          setNotice(p("inviteCancelled"));
                        })
                      }
                    >
                      {p("cancelInvitation")}
                    </Button>
                  )}
                </div>
              );
            })
          )}
          {!invites.isLoading && !invites.data?.length && (
            <p className="p-6 text-muted-foreground">{p("noInvitations")}</p>
          )}
        </div>
      </section>
      <Dialog
        open={showInvite}
        onOpenChange={(v) => {
          setShowInvite(v);
          if (!v) setLink("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p("inviteRepresentative")}</DialogTitle>
            <DialogDescription>{p("inviteLinkHelp")}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {link ? (
            <div className="space-y-4">
              <p className="text-sm">{p("inviteCreated")}</p>
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
            <form onSubmit={createInvite} className="space-y-4">
              <label className="grid gap-2 text-sm">
                {p("displayName")}
                <Input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {p("email")}
                <Input
                  required
                  type="email"
                  maxLength={320}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {p("profileRole")}
                <select
                  className={control}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {["ambassador", "business_developer", "staff"].map((r) => (
                    <option key={r} value={r}>
                      {p(r)}
                    </option>
                  ))}
                </select>
              </label>
              <DialogFooter>
                <Button type="submit" disabled={busy || preview}>
                  {p("createInvitation")}
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
            <DialogTitle>{p("manageAccess")}</DialogTitle>
            <DialogDescription>{p("deactivateHelp")}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await command("portal_set_member", {
                    p_org: org,
                    p_user: editing.user_id,
                    p_role: editing.role,
                    p_name: editing.display_name,
                    p_active: editing.active,
                  });
                  setEditing(null);
                  setNotice(p("saved"));
                });
              }}
            >
              <label className="grid gap-2 text-sm">
                {p("displayName")}
                <Input
                  required
                  maxLength={120}
                  value={editing.display_name}
                  onChange={(e) =>
                    setEditing({ ...editing, display_name: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm">
                {p("profileRole")}
                <select
                  className={control}
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      role: e.target.value as PortalMember["role"],
                    })
                  }
                >
                  {["ambassador", "business_developer", "staff"].map((r) => (
                    <option key={r} value={r}>
                      {p(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
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
    </section>
  );
}
