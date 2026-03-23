import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, Mail, Lock, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type InviteDetails = {
  invited_email: string;
  role: string;
  org_name: string;
  org_id: string;
};

type PageState = "loading" | "ready" | "invalid" | "already_accepted" | "expired" | "success";

const ROLE_LABELS: Record<string, string> = {
  owner:   "Owner",
  admin:   "Admin",
  manager: "Manager",
  member:  "Member",
};

export default function AcceptInvite() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const token      = params.get("token") ?? "";

  const [state,    setState]    = useState<PageState>("loading");
  const [invite,   setInvite]   = useState<InviteDetails | null>(null);
  const [mode,     setMode]     = useState<"signup" | "signin">("signup");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authErr,  setAuthErr]  = useState("");
  const [working,  setWorking]  = useState(false);

  // Step 1 — fetch invite details
  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("accept-invitation", {
        body: { token },
      });
      if (error || data?.error) {
        const msg = data?.error ?? error?.message ?? "";
        if (msg.includes("expired"))  setState("expired");
        else if (msg.includes("already accepted")) setState("already_accepted");
        else setState("invalid");
        return;
      }
      setInvite(data as InviteDetails);
      setEmail(data.invited_email ?? "");
      setState("ready");
    })();
  }, [token]);

  // Step 2 — if user is already logged in with the right account, accept immediately
  useEffect(() => {
    if (state !== "ready" || !invite || !user) return;
    if (user.email?.toLowerCase() === invite.invited_email.toLowerCase()) {
      acceptWithUserId(user.id);
    }
  }, [state, invite, user]);

  const acceptWithUserId = async (userId: string) => {
    setWorking(true);
    const { error } = await supabase.functions.invoke("accept-invitation", {
      body: { token, user_id: userId },
    });
    if (error) {
      setAuthErr("Failed to accept invitation. Please try again.");
      setWorking(false);
      return;
    }
    setState("success");
    setTimeout(() => navigate("/dashboard"), 1500);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErr("");
    setWorking(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.user) await acceptWithUserId(data.user.id);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await acceptWithUserId(data.user.id);
      }
    } catch (err: unknown) {
      setAuthErr(err instanceof Error ? err.message : "Authentication failed");
      setWorking(false);
    }
  };

  // ── Render states ───────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-muted-foreground" size={28} />
      </div>
    );
  }

  if (state === "invalid" || state === "expired" || state === "already_accepted") {
    const messages: Record<string, { title: string; body: string }> = {
      invalid:          { title: "Invalid invite link",      body: "This invite link is not valid or has been cancelled." },
      expired:          { title: "Invite link expired",      body: "This invite link has expired. Ask the admin to send a new one." },
      already_accepted: { title: "Already accepted",         body: "This invite has already been accepted. You can sign in normally." },
    };
    const m = messages[state];
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <XCircle className="mx-auto text-destructive" size={40} />
          <h1 className="text-xl font-bold">{m.title}</h1>
          <p className="text-sm text-muted-foreground">{m.body}</p>
          <Button variant="outline" onClick={() => navigate("/auth")}>Go to Sign In</Button>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
          <h1 className="text-xl font-bold">Welcome aboard!</h1>
          <p className="text-sm text-muted-foreground">You've joined {invite?.org_name}. Redirecting…</p>
        </div>
      </div>
    );
  }

  // state === "ready" — show auth form
  // If already logged in as a DIFFERENT user, show a warning
  if (user && user.email?.toLowerCase() !== invite?.invited_email.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-4 text-center">
          <XCircle className="mx-auto text-amber-500" size={36} />
          <h1 className="text-lg font-bold">Wrong account</h1>
          <p className="text-sm text-muted-foreground">
            This invite was sent to <strong>{invite?.invited_email}</strong>, but you're signed in as <strong>{user.email}</strong>.
          </p>
          <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>
            Sign out and use correct account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1 text-2xl font-bold">
            <span className="text-primary">LV</span><span>Branding</span>
          </div>
          <h1 className="text-xl font-bold mt-3">You've been invited!</h1>
          {invite && (
            <p className="text-sm text-muted-foreground">
              Join <strong>{invite.org_name}</strong> as a{" "}
              <span className="text-primary font-semibold">{ROLE_LABELS[invite.role] ?? invite.role}</span>
            </p>
          )}
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${mode === "signup" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setMode("signup")}
            >
              <UserPlus size={13} /> Create Account
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${mode === "signin" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setMode("signin")}
            >
              <LogIn size={13} /> Sign In
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="full-name">Full Name</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-8"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-8"
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
            </div>

            {authErr && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{authErr}</p>
            )}

            <Button type="submit" disabled={working} className="w-full gap-2">
              {working
                ? <><Loader2 size={14} className="animate-spin" />Processing…</>
                : mode === "signup"
                  ? <><UserPlus size={14} />Create Account & Join</>
                  : <><LogIn size={14} />Sign In & Join</>
              }
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
