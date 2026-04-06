import { useState } from "react";
import {
  Receipt, ExternalLink, CheckCircle2, Clock, Loader2, Send, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCreateSessionInvoice, useSendSessionInvoice, useMarkInvoicePaid, useUpdateSession } from "@/hooks/usePhotoSessions";
import type { PhotoSession } from "@/integrations/supabase/types";

interface SessionInvoicePanelProps {
  session: PhotoSession;
}

export default function SessionInvoicePanel({ session }: SessionInvoicePanelProps) {
  const { toast } = useToast();
  const createInvoice = useCreateSessionInvoice();
  const sendInvoice = useSendSessionInvoice();
  const markPaid = useMarkInvoicePaid();
  const updateSession = useUpdateSession();

  const [manualUrl, setManualUrl] = useState(session.session_invoice_url ?? "");
  const [savingUrl, setSavingUrl] = useState(false);

  const isPaid = !!session.session_invoice_paid_at;
  const isSent = !!session.session_invoice_sent_at;
  const hasInvoice = !!session.session_invoice_url;
  const extraCount = session.finalized_at && session.wave_invoice_url ? 1 : 0; // extras tracked separately

  // ── Session fee invoice ───────────────────────────────────────────────────
  const handleCreateInvoice = async () => {
    try {
      await createInvoice.mutateAsync(session.id);
      toast({ description: "Invoice created and ready to send." });
    } catch {
      toast({ description: "Failed to create invoice.", variant: "destructive" });
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid.mutateAsync(session.id);
      toast({ description: "Invoice marked as paid." });
    } catch {
      toast({ description: "Failed to mark as paid.", variant: "destructive" });
    }
  };

  // ── Manual invoice URL save ───────────────────────────────────────────────
  const handleSaveUrl = async () => {
    setSavingUrl(true);
    try {
      await updateSession.mutateAsync({
        id: session.id,
        session_invoice_url: manualUrl || null,
        session_invoice_sent_at: manualUrl ? new Date().toISOString() : null,
      });
      toast({ description: "Invoice link saved." });
    } catch {
      toast({ description: "Failed to save link.", variant: "destructive" });
    } finally {
      setSavingUrl(false);
    }
  };

  if (session.invoice_type === "none") return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <Receipt size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Invoice</span>
        </div>
        <div className="flex items-center gap-2">
          {isPaid ? (
            <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
              <CheckCircle2 size={11} /> Paid
            </Badge>
          ) : isSent ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
              <Clock size={11} /> Awaiting Payment
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <Clock size={11} /> Not sent
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Fee summary */}
        {session.invoice_type === "session" && (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session fee</span>
              <span className="font-semibold">${Number(session.session_fee).toFixed(2)}</span>
            </div>
            {session.finalized_at && Number(session.extra_photo_price) > 0 && extraCount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Extra photos (see Wave invoice)</span>
                <a
                  href={session.wave_invoice_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  View <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Session fee invoice — auto Wave */}
        {session.invoice_type === "session" && (
          <>
            {!hasInvoice ? (
              <Button
                size="sm"
                className="w-full gap-1.5"
                disabled={createInvoice.isPending}
                onClick={handleCreateInvoice}
              >
                {createInvoice.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
                  : <><Send size={13} /> Create &amp; Send Invoice via Wave</>
                }
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <a
                  href={session.session_invoice_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink size={13} /> View Invoice in Wave
                </a>
                {!isPaid && (
                  <Button
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={sendInvoice.isPending}
                    onClick={async () => {
                      try {
                        await sendInvoice.mutateAsync(session.id);
                        toast({ description: "Invoice sent to client." });
                      } catch {
                        toast({ description: "Failed to send invoice.", variant: "destructive" });
                      }
                    }}
                  >
                    {sendInvoice.isPending
                      ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                      : <><Send size={13} /> Send Invoice to Client</>
                    }
                  </Button>
                )}
                {!isPaid && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={markPaid.isPending}
                    onClick={handleMarkPaid}
                  >
                    {markPaid.isPending
                      ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                      : <><CheckCircle2 size={13} /> Mark as Paid</>
                    }
                  </Button>
                )}
                {isPaid && session.session_invoice_paid_at && (
                  <p className="text-xs text-green-700">
                    Paid on {new Date(session.session_invoice_paid_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Manual invoice — paste link */}
        {session.invoice_type === "manual" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-7 text-sm h-8"
                  placeholder="Paste Wave invoice URL…"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
              </div>
              <Button size="sm" className="h-8 shrink-0" disabled={savingUrl} onClick={handleSaveUrl}>
                {savingUrl ? <Loader2 size={13} className="animate-spin" /> : "Save"}
              </Button>
            </div>
            {hasInvoice && (
              <div className="flex items-center justify-between">
                <a
                  href={session.session_invoice_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink size={11} /> Open invoice
                </a>
                {!isPaid && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    disabled={markPaid.isPending}
                    onClick={handleMarkPaid}
                  >
                    <CheckCircle2 size={12} /> Mark as paid
                  </Button>
                )}
              </div>
            )}
            {isPaid && session.session_invoice_paid_at && (
              <p className="text-xs text-green-700">
                Paid on {new Date(session.session_invoice_paid_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
