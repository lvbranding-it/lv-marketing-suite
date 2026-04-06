import {
  ExternalLink, CheckCircle2, Clock, Loader2, Send, ImagePlus, Hourglass, FilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCreateTopupInvoice, useSendTopupInvoice, useMarkTopupPaid } from "@/hooks/usePhotoSessions";
import type { PhotoSession, SessionPhoto } from "@/integrations/supabase/types";

interface TopupInvoicePanelProps {
  session: PhotoSession;
  photos: SessionPhoto[];
}

export default function TopupInvoicePanel({ session, photos }: TopupInvoicePanelProps) {
  const { toast } = useToast();
  const createTopup = useCreateTopupInvoice();
  const sendTopup = useSendTopupInvoice();
  const markPaid = useMarkTopupPaid();

  // Only show when extras are priced and a limit is set
  if (session.photo_limit === 0 || Number(session.extra_photo_price) === 0) return null;

  // Count photos the client chose (any status beyond not_selected)
  const chosenCount = photos.filter((p) =>
    ["selected", "editing", "ready", "ready_for_download"].includes(p.status)
  ).length;
  const extraCount = Math.max(0, chosenCount - session.photo_limit);
  const extraTotal = extraCount * Number(session.extra_photo_price);

  const isPaid = !!session.topup_invoice_paid_at;
  const isSent = !!session.topup_invoice_sent_at;
  const hasInvoice = !!session.wave_invoice_id;
  const isFinalized = !!session.finalized_at;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    try {
      await sendTopup.mutateAsync(session.id);
      toast({ description: "Top-up invoice sent to client." });
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Failed to send top-up invoice.",
        variant: "destructive",
      });
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid.mutateAsync(session.id);
      toast({ description: "Top-up invoice marked as paid." });
    } catch {
      toast({ description: "Failed to mark as paid.", variant: "destructive" });
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <ImagePlus size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Extra Photos Invoice</span>
        </div>
        <div className="flex items-center gap-2">
          {!isFinalized ? (
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <Hourglass size={11} /> Awaiting client
            </Badge>
          ) : isPaid ? (
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
        {/* Extras breakdown */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Included in session</span>
            <span>{session.photo_limit} photos</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Client selected</span>
            <span>{chosenCount} photos</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 mt-1">
            <span className="text-muted-foreground">
              Extra photos{extraCount > 0 ? ` (×${extraCount} @ $${Number(session.extra_photo_price).toFixed(2)})` : ""}
            </span>
            <span className={`font-semibold ${extraCount > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
              {extraCount > 0 ? `$${extraTotal.toFixed(2)}` : "—"}
            </span>
          </div>
        </div>

        {/* State: not finalized yet */}
        {!isFinalized && (
          <p className="text-xs text-muted-foreground">
            The top-up invoice will be created automatically once the client confirms their selection.
          </p>
        )}

        {/* State: finalized, no extras */}
        {isFinalized && extraCount === 0 && (
          <p className="text-xs text-green-700">
            ✓ Client selected within the included limit — no extra charge.
          </p>
        )}

        {/* State: finalized with extras */}
        {isFinalized && extraCount > 0 && (
          <div className="flex flex-col gap-2">
            {/* Wave invoice link */}
            {session.wave_invoice_url && (
              <a
                href={session.wave_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink size={13} /> View Invoice in Wave
              </a>
            )}

                    {/* No invoice yet — create it retroactively */}
            {!hasInvoice && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                disabled={createTopup.isPending}
                onClick={async () => {
                  try {
                    await createTopup.mutateAsync(session.id);
                    toast({ description: "Top-up invoice created in Wave." });
                  } catch (e: unknown) {
                    toast({
                      description: e instanceof Error ? e.message : "Failed to create invoice.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {createTopup.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
                  : <><FilePlus size={13} /> Create Top-up Invoice in Wave</>
                }
              </Button>
            )}

            {/* Send button */}
            {hasInvoice && !isPaid && (
              <Button
                size="sm"
                className="w-full gap-1.5"
                disabled={sendTopup.isPending}
                onClick={handleSend}
              >
                {sendTopup.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                  : <><Send size={13} /> Send Invoice to Client</>
                }
              </Button>
            )}

            {/* Mark as paid */}
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

            {/* Paid confirmation */}
            {isPaid && session.topup_invoice_paid_at && (
              <p className="text-xs text-green-700">
                Paid on{" "}
                {new Date(session.topup_invoice_paid_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </p>
            )}

            {/* Sent timestamp */}
            {isSent && !isPaid && session.topup_invoice_sent_at && (
              <p className="text-xs text-muted-foreground">
                Sent on{" "}
                {new Date(session.topup_invoice_sent_at).toLocaleDateString(undefined, {
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
