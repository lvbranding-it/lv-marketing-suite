import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State = "loading" | "success" | "error" | "invalid";

export default function Unsubscribe() {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("rid");
    if (!rid) { setState("invalid"); return; }

    supabase.functions.invoke("email-unsubscribe", {
      body: { rid },
    }).then(({ data, error }) => {
      if (error || !data?.success) {
        setState("error");
      } else {
        setEmail(data.email ?? "");
        setState("success");
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {/* Logo */}
        <p className="text-xl font-bold text-primary">LV Branding</p>

        {state === "loading" && (
          <div className="space-y-3">
            <Loader2 size={40} className="animate-spin text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">Processing your request…</p>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-3">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold">You've been unsubscribed</h1>
            {email && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{email}</span> will no longer receive emails from us.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              This may take up to 24 hours to take effect. If you believe this was a mistake, please contact us at admin@lvbranding.com.
            </p>
          </div>
        )}

        {(state === "error" || state === "invalid") && (
          <div className="space-y-3">
            <XCircle size={48} className="text-destructive mx-auto" />
            <h1 className="text-xl font-bold">Invalid link</h1>
            <p className="text-sm text-muted-foreground">
              This unsubscribe link is invalid or has already been used. Contact us at admin@lvbranding.com if you need help.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
