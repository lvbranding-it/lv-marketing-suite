import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, AtSign, Check, KeyRound, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LVLogo from "@/components/LVLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { safePortalReturn } from "@/lib/portal/invitations";
import "./Auth.css";

const signInSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const resetSchema = z.object({
  email: z.string().email("Invalid email"),
});

type SignInValues = z.infer<typeof signInSchema>;
type ResetValues = z.infer<typeof resetSchema>;

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safePortalReturn(params.get("returnTo"));
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      if(returnTo === "/portal-invite") navigate("/portal-invite", {replace:true});
      return;
    }
    let cancelled = false;
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }
    // Existing suite accounts keep their landing page. Explicit portal members
    // can enter their private workspace even if signup created a personal org.
    void (async () => {
      try {
        const { data } = await (supabase as any).rpc("portal_workspaces");
        const workspace = (
          data as { org_id: string; role: string }[] | null
        )?.find((w) =>
          ["ambassador", "business_developer", "staff"].includes(w.role),
        );
        if (!cancelled)
          navigate(
            workspace ? `/portal?org=${workspace.org_id}` : "/dashboard",
            { replace: true },
          );
      } catch {
        if (!cancelled) navigate("/dashboard", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, loading, navigate, returnTo]);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  });

  const onSignIn = async (values: SignInValues) => {
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) throw error;
      // Auth state above chooses the appropriate workspace.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onReset = async (values: ResetValues) => {
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        values.email,
        {
          redirectTo: `${window.location.origin}/auth`,
        },
      );
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send reset email",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showReset = () => {
    resetForm.setValue("email", signInForm.getValues("email"));
    setMode("reset");
    setError(null);
    signInForm.reset();
  };

  const showSignIn = () => {
    setMode("signin");
    setError(null);
    setResetSent(false);
    resetForm.reset();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading sign in">
        <Loader2 className="animate-spin text-primary" size={24} aria-hidden />
      </div>
    );
  }

  return (
    <main className="auth-scene">
      <div className="auth-composition">
        <section className="auth-login-card" aria-labelledby="auth-heading">
          <header className="auth-brand">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true"><LVLogo size={36} /></span>
              <span className="text-sm font-medium tracking-tight">LV Branding</span>
            </div>
            <span className="auth-brand-caption">Marketing Suite</span>
          </header>

          <div className="auth-form-content">
            <div className="auth-heading-row">
              <h1 id="auth-heading">{mode === "signin" ? "Welcome back." : "Reset password."}</h1>
              <span className="auth-heading-mark" aria-hidden="true"><Sparkles size={19} strokeWidth={1.5} /></span>
            </div>
            <p className="auth-intro">
              {mode === "signin"
                ? "Your next great idea starts here."
                : "Enter your email and we’ll send a reset link."}
            </p>

            {mode === "signin" ? (
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="auth-form" noValidate>
                <div>
                  <Label htmlFor="email" className="sr-only">Email</Label>
                  <div className="auth-field">
                    <span className="auth-field-icon" aria-hidden="true"><AtSign size={18} strokeWidth={1.6} /></span>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      placeholder="Email address"
                      className="auth-input"
                      aria-invalid={!!signInForm.formState.errors.email}
                      aria-describedby={signInForm.formState.errors.email ? "email-error" : undefined}
                      {...signInForm.register("email")}
                    />
                  </div>
                  {signInForm.formState.errors.email && (
                    <p id="email-error" role="alert" className="auth-field-error">{signInForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="password" className="sr-only">Password</Label>
                  <div className="auth-field">
                    <span className="auth-field-icon" aria-hidden="true"><KeyRound size={18} strokeWidth={1.6} /></span>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      className="auth-input auth-password-input"
                      aria-invalid={!!signInForm.formState.errors.password}
                      aria-describedby={signInForm.formState.errors.password ? "password-error" : undefined}
                      {...signInForm.register("password")}
                    />
                    <button type="button" className="auth-forgot" onClick={showReset} disabled={submitting} aria-label="Forgot password? Reset it">I forgot</button>
                  </div>
                  {signInForm.formState.errors.password && (
                    <p id="password-error" role="alert" className="auth-field-error">{signInForm.formState.errors.password.message}</p>
                  )}
                </div>
                {error && <p role="alert" className="auth-error">{error}</p>}
                <div className="auth-submit-row">
                  <p>A little inspiration.<br />A lot of possibility.</p>
                  <Button type="submit" className="auth-submit" disabled={submitting}>
                    {submitting ? "Signing in" : "Sign in"}
                    <span className="auth-submit-icon" aria-hidden="true">
                      {submitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                    </span>
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {resetSent ? (
                  <div role="status" className="auth-reset-success">
                    <Check size={22} aria-hidden="true" />
                    <div><p className="font-medium">Check your inbox.</p><p className="mt-1 text-sm">A password reset link has been sent.</p></div>
                  </div>
                ) : (
                  <form onSubmit={resetForm.handleSubmit(onReset)} className="auth-form" noValidate>
                    <div>
                      <Label htmlFor="reset-email" className="sr-only">Email</Label>
                      <div className="auth-field">
                        <span className="auth-field-icon" aria-hidden="true"><AtSign size={18} strokeWidth={1.6} /></span>
                        <Input
                          id="reset-email"
                          type="email"
                          autoComplete="email"
                          placeholder="Email address"
                          className="auth-input"
                          aria-invalid={!!resetForm.formState.errors.email}
                          aria-describedby={resetForm.formState.errors.email ? "reset-email-error" : undefined}
                          {...resetForm.register("email")}
                        />
                      </div>
                      {resetForm.formState.errors.email && (
                        <p id="reset-email-error" role="alert" className="auth-field-error">{resetForm.formState.errors.email.message}</p>
                      )}
                    </div>
                    {error && <p role="alert" className="auth-error">{error}</p>}
                    <Button type="submit" className="auth-submit self-end" disabled={submitting}>
                      {submitting ? "Sending link" : "Send reset link"}
                      <span className="auth-submit-icon" aria-hidden="true">
                        {submitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                      </span>
                    </Button>
                  </form>
                )}
                <button type="button" className="auth-back" onClick={showSignIn} disabled={submitting}><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</button>
              </>
            )}
          </div>
          <p className="auth-card-footer">Made for the way you create.</p>
        </section>

        <aside className="auth-note-card" aria-label="Your marketing workspace">
          <div>
            <p className="auth-note-heading">Less busywork.</p>
            <p className="auth-note-muted">More possibility.</p>
          </div>
          <div className="auth-note-bottom">
            <span>Strategy First, Always.</span>
            <Sparkles size={22} strokeWidth={1.3} aria-hidden="true" />
          </div>
        </aside>

        <aside className="auth-feature-card" aria-label="Marketing Suite features">
          <div className="auth-feature-orb" aria-hidden="true" />
          <div className="auth-feature-glass" aria-hidden="true" />
          <div className="auth-feature-top">
            <div>
              <p className="auth-feature-number">33<span className="text-primary">.</span></p>
              <p className="auth-feature-label">AI-powered<br />marketing skills</p>
            </div>
            <p className="auth-feature-caption">Your vision.<br />One workspace.</p>
          </div>
          <div className="auth-feature-message">
            <h2>Think big.<br /><span>Create more.</span></h2>
            <p>From the first spark<br />to your next big launch.</p>
          </div>
          <div className="auth-feature-bottom">
            <div className="auth-feature-signature"><span aria-hidden="true"><LVLogo size={40} /></span><span>LV Branding</span></div>
            <span className="auth-feature-tag"><span />Built for your team</span>
          </div>
        </aside>
        <footer className="auth-page-footer"><span>LV Branding © {new Date().getFullYear()}</span><span>Ideas into impact.</span></footer>
      </div>
    </main>
  );
}
