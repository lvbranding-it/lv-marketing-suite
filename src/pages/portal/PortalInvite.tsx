import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import {
  readPortalInvitation,
  clearPortalInvitation,
} from "@/lib/portal/invitations";
import LVLogo from "@/components/LVLogo";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function PortalInvite() {
  const { user, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const p = (k: string) => t(`portal.${k}`);
  const [token] = useState(readPortalInvitation);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const navigate = useNavigate(),
    qc = useQueryClient();
  const details = useQuery({
    queryKey: ["portal", user?.id, "invitation", token],
    enabled: !!token && !!user,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "portal_invitation_details",
        { p_token: token },
      );
      if (error) throw error;
      return data?.[0] as
        { org_name: string; role: string; display_name: string } | undefined;
    },
  });
  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/portal-invite`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch {
      setError(p("inviteLinkFailed"));
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await (supabase as any).rpc(
        "portal_accept_invitation",
        { p_token: token },
      );
      if (error) throw error;
      clearPortalInvitation();
      await qc.invalidateQueries({ queryKey: ["portal", user?.id] });
      navigate(`/portal?org=${data}`, { replace: true });
    } catch {
      setError(p("inviteUnavailable"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-muted/30 p-5 flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
      <div className="flex justify-center" aria-label="LV Branding"><LVLogo size={44.1}/></div>
      <section className="rounded-2xl border bg-white p-7 space-y-5">
        <div className="flex justify-end"><LanguageSwitcher appearance="surface" className="w-36"/></div>
        <h1 className="text-2xl font-semibold">{p("inviteWelcome")}</h1>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">{p("loading")}</p>
        ) : !token ? (
          <p>{p("inviteReopen")}</p>
        ) : user ? (
          <>
            <p className="text-sm text-muted-foreground">
              {p("signedInAs")} {user.email}
            </p>
            {details.isLoading ? (
              <p role="status">{p("loading")}</p>
            ) : details.isError || !details.data ? (
              <p role="alert" className="text-sm">
                {p("inviteUnavailable")}
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {details.data.org_name} · {p(details.data.role)}
                </p>
                <p className="text-sm">{p("inviteAcceptHelp")}</p>
                <Button className="w-full" disabled={busy} onClick={accept}>
                  {p("acceptInvitation")}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signOut()}
            >
              {p("switchAccount")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{p("invitePasswordlessHelp")}</p>
            {sent ? (
              <div className="space-y-4">
                <p role="status" className="text-sm text-emerald-800">{p("inviteLinkSent")}</p>
                <Button variant="outline" className="w-full" onClick={()=>setSent(false)}>{p("inviteTryEmail")}</Button>
              </div>
            ) : (
              <form onSubmit={sendLink} className="space-y-4">
                <label className="grid gap-2 text-sm">
                  {p("email")}
                  <Input type="email" required maxLength={320} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/>
                </label>
                <Button className="w-full" disabled={busy} type="submit">{p(busy?"saving":"inviteSendLink")}</Button>
              </form>
            )}
          </>
        )}
      </section>
      </div>
    </main>
  );
}
