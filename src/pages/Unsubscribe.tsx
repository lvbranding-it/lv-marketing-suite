import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { auditCopyFor } from "@/lib/website-audit/copy";
import type { AuditLanguage } from "@/lib/website-audit/types";

type State = "loading" | "success" | "error" | "invalid";

/**
 * One confirmation page for every kind of stop request.
 *
 * `?rid=` is a campaign recipient, the original use. `?s=` is a Website
 * Opportunity Audit report send, which resolves to the same suppression list, so
 * a person who stops one is stopped for both. Audit links carry `?lang=` and are
 * answered in that language; the campaign path stays English, as its emails are.
 */
export default function Unsubscribe() {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const params = new URLSearchParams(window.location.search);
  const auditSendId = params.get("s");
  const auditLanguage: AuditLanguage = params.get("lang") === "es" ? "es" : "en";
  const auditCopy = auditCopyFor(auditLanguage).reportEmail;

  useEffect(() => {
    const rid = params.get("rid");
    const sendId = params.get("s");

    if (sendId) {
      supabase.functions.invoke("website-audit", {
        body: { action: "stop", sendId },
      }).then(({ data, error }) => setState(error || !data?.ok ? "invalid" : "success"));
      return;
    }

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
    // Read once from the URL the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <h1 className="text-xl font-bold">{auditSendId ? auditCopy.stopHeading : "You've been unsubscribed"}</h1>
            {auditSendId ? (
              <p className="text-sm text-muted-foreground">{auditCopy.stopBody}</p>
            ) : (
              <>
                {email && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{email}</span> will no longer receive emails from us.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  This may take up to 24 hours to take effect. If you believe this was a mistake, please contact us at admin@lvbranding.com.
                </p>
              </>
            )}
          </div>
        )}

        {(state === "error" || state === "invalid") && (
          <div className="space-y-3">
            <XCircle size={48} className="text-destructive mx-auto" />
            <h1 className="text-xl font-bold">{auditSendId ? auditCopy.stopInvalid : "Invalid link"}</h1>
            {!auditSendId && (
              <p className="text-sm text-muted-foreground">
                This unsubscribe link is invalid or has already been used. Contact us at admin@lvbranding.com if you need help.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
