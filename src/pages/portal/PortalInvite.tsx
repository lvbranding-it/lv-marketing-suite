import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
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
  const signup = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/portal-invite`,
        },
      });
      if (error) throw error;
      setPassword("");
      setSent(true);
    } catch {
      setError(p("authFailed"));
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
          <p>{p("inviteUnavailable")}</p>
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
            <p className="text-sm text-muted-foreground">
              {p("inviteAuthHelp")}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth?returnTo=%2Fportal-invite">{p("signIn")}</Link>
            </Button>
            {sent ? (
              <p role="status" className="text-sm text-emerald-800">
                {p("verifyEmail")}
              </p>
            ) : (
              <form onSubmit={signup} className="space-y-4 border-t pt-4">
                <h2 className="font-medium">{p("createAccount")}</h2>
                <label className="grid gap-2 text-sm">
                  {p("displayName")}
                  <Input
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  {p("email")}
                  <Input
                    type="email"
                    required
                    maxLength={320}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  {p("password")}
                  <Input
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {p("passwordHelp")}
                </p>
                <Button className="w-full" disabled={busy} type="submit">
                  {p("createAccount")}
                </Button>
              </form>
            )}
          </>
        )}
      </section>
      </div>
    </main>
  );
}
