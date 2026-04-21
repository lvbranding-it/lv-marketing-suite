import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LVLogo from "@/components/LVLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate("/dashboard");
    }
  }, [session, loading, navigate]);

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
      navigate("/dashboard");
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
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 bg-lv-charcoal flex-col items-center justify-center p-12 text-white">
        <LVLogo size={72} className="mb-6" />
        <h1 className="text-3xl font-bold mb-2 text-white">LV Branding</h1>
        <p className="text-white/60 text-lg">Marketing Suite</p>
        <div className="mt-12 space-y-4 max-w-xs w-full">
          {[
            { icon: "🎯", text: "33 AI-powered marketing skills" },
            { icon: "📊", text: "Organized by project and client" },
            { icon: "⚡", text: "Real-time streaming AI output" },
            { icon: "👥", text: "Team collaboration built in" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-white/70 text-sm">
              <span className="text-xl">{icon}</span>
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm space-y-4 sm:space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-2">
            <LVLogo size={48} className="mb-2" />
            <p className="text-muted-foreground text-sm">Marketing Suite</p>
          </div>

          {mode === "signin" && (
            <>
              <div>
                <h2 className="text-2xl font-bold">Welcome back</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Sign in to your Marketing Suite
                </p>
              </div>

              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@lvbranding.com"
                    {...signInForm.register("email")}
                  />
                  {signInForm.formState.errors.email && (
                    <p className="text-xs text-destructive">
                      {signInForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    {...signInForm.register("password")}
                  />
                  {signInForm.formState.errors.password && (
                    <p className="text-xs text-destructive">
                      {signInForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
                  Sign In
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Forgot your password?{" "}
                <button
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode("reset");
                    setError(null);
                    signInForm.reset();
                  }}
                >
                  Reset it
                </button>
              </p>
            </>
          )}

          {mode === "reset" && (
            <>
              <div>
                <h2 className="text-2xl font-bold">Reset password</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Enter your email and we'll send a reset link.
                </p>
              </div>

              {resetSent ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg">
                  Check your inbox — a reset link has been sent.
                </div>
              ) : (
                <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="you@lvbranding.com"
                      {...resetForm.register("email")}
                    />
                    {resetForm.formState.errors.email && (
                      <p className="text-xs text-destructive">
                        {resetForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Send Reset Link
                  </Button>
                </form>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Remember it?{" "}
                <button
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setResetSent(false);
                    resetForm.reset();
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
