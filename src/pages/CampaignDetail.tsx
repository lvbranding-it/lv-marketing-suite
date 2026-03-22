import { useParams, useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Send, BarChart2, MousePointerClick, AlertTriangle,
  UserX, Loader2, CheckCircle2, XCircle, Clock, Eye, RefreshCw, Copy,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCampaign, useCampaignRecipients, useSendCampaign } from "@/hooks/useCampaigns";
import { useToast } from "@/hooks/use-toast";
import type { EmailCampaignRecipient } from "@/integrations/supabase/types";

const RECIPIENT_STATUS: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  pending:     { label: "Pending",     class: "bg-slate-100 text-slate-600",     icon: <Clock size={10} /> },
  sent:        { label: "Sent",        class: "bg-blue-100 text-blue-700",       icon: <Send size={10} /> },
  opened:      { label: "Opened",      class: "bg-indigo-100 text-indigo-700",   icon: <Eye size={10} /> },
  clicked:     { label: "Clicked",     class: "bg-emerald-100 text-emerald-700", icon: <MousePointerClick size={10} /> },
  bounced:     { label: "Bounced",     class: "bg-orange-100 text-orange-700",   icon: <AlertTriangle size={10} /> },
  unsubscribed:{ label: "Unsub'd",     class: "bg-red-100 text-red-600",         icon: <UserX size={10} /> },
  failed:      { label: "Failed",      class: "bg-red-100 text-red-600",         icon: <XCircle size={10} /> },
};

function pct(n: number, d: number) { return d ? `${Math.round((n / d) * 100)}%` : "0%"; }

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: campaign, isLoading: cLoading } = useCampaign(id ?? null);
  const { data: recipients = [], isLoading: rLoading } = useCampaignRecipients(id ?? null);
  const sendCampaign = useSendCampaign();

  const handleSend = async () => {
    if (!id) return;
    try {
      const result = await sendCampaign.mutateAsync(id);
      toast({ description: `✅ Sent to ${result.sent} contacts.` });
    } catch (e: unknown) {
      toast({ variant: "destructive", description: "Send failed. Check console." });
    }
  };

  const handleSendAgain = () => {
    if (!campaign) return;
    navigate("/campaigns/new", {
      state: {
        cloneFrom: {
          name:         campaign.name + " (Copy)",
          subject:      campaign.subject,
          preview_text: campaign.preview_text,
          body_html:    campaign.body_html,
        },
      },
    });
  };

  if (cLoading) {
    return (
      <AppShell>
        <Header title="Campaign" />
        <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!campaign) {
    return (
      <AppShell>
        <Header title="Campaign" />
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Campaign not found.</p>
          <Button variant="ghost" onClick={() => navigate("/campaigns")} className="mt-4 gap-2">
            <ArrowLeft size={14} /> Back to campaigns
          </Button>
        </div>
      </AppShell>
    );
  }

  const isSent    = campaign.status === "sent";
  const isDraft   = campaign.status === "draft";
  const isSending = campaign.status === "sending";

  return (
    <AppShell>
      <Header title={campaign.name ?? "Campaign"} />
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/campaigns")} className="gap-1.5 -ml-2">
          <ArrowLeft size={14} /> Campaigns
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold truncate">{campaign.name}</h1>
            <span className={cn(
              "text-[10px] border px-1.5 py-0.5 rounded-full font-medium",
              { draft: "bg-slate-100 text-slate-600 border-slate-200",
                sending: "bg-amber-100 text-amber-700 border-amber-200",
                sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
                failed: "bg-red-100 text-red-600 border-red-200" }[campaign.status]
            )}>
              {isSending ? <span className="flex items-center gap-1"><Loader2 size={9} className="animate-spin" />Sending…</span> : campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{campaign.subject}</p>
          {campaign.sent_at && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Sent {format(new Date(campaign.sent_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        {isSent && (
          <Button variant="outline" onClick={handleSendAgain} className="gap-2 shrink-0">
            <Copy size={13} /> Send Again
          </Button>
        )}
        {isDraft && (
          <Button onClick={handleSend} disabled={sendCampaign.isPending} className="gap-2 shrink-0">
            {sendCampaign.isPending
              ? <><Loader2 size={13} className="animate-spin" />Sending…</>
              : <><Send size={13} />Send Campaign</>}
          </Button>
        )}
      </div>

      {/* Stats */}
      {isSent && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {[
            { label: "Sent",          value: campaign.sent_count,                                  color: "" },
            { label: "Opened",        value: `${pct(campaign.open_count, campaign.sent_count)} (${campaign.open_count})`,        color: "text-blue-600" },
            { label: "Clicked",       value: `${pct(campaign.click_count, campaign.sent_count)} (${campaign.click_count})`,       color: "text-emerald-600" },
            { label: "Bounced",       value: campaign.bounce_count,                                color: "text-orange-600" },
            { label: "Unsubscribed",  value: campaign.unsubscribe_count,                           color: "text-red-600" },
            { label: "Recipients",    value: campaign.recipient_count,                             color: "" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
              <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {isDraft && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Clock size={16} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Ready to send</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {campaign.recipient_count} recipients queued. Click "Send Campaign" to start delivering.
            </p>
          </div>
        </div>
      )}

      {/* Email preview */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Email Body Preview</p>
        <div
          className="border border-border rounded-xl overflow-hidden bg-[#f4f4f5] p-3 sm:p-4"
          dangerouslySetInnerHTML={{ __html: campaign.body_html }}
        />
      </div>

      {/* Recipients table */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Recipients ({recipients.length})
        </p>
        {rLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Header — hidden on mobile */}
            <div className="hidden sm:grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr] gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Name</span>
              <span>Email</span>
              <span>Company</span>
              <span>Status</span>
              <span>Sent</span>
            </div>
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {recipients.map((r) => {
                const s = RECIPIENT_STATUS[r.status] ?? RECIPIENT_STATUS.pending;
                return (
                  <div key={r.id} className="sm:grid sm:grid-cols-[2fr_2fr_1.5fr_1fr_1fr] gap-3 px-3 sm:px-4 py-2.5 text-xs hover:bg-muted/30 flex sm:flex-none items-center sm:items-center justify-between sm:justify-normal">
                    <div className="flex-1 min-w-0 sm:contents">
                      <span className="truncate font-medium">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                      </span>
                      <span className="truncate text-muted-foreground hidden sm:block">{r.email}</span>
                      <span className="truncate text-muted-foreground hidden sm:block">{r.company ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium", s.class)}>
                        {s.icon}{s.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground hidden sm:block">
                        {r.sent_at ? formatDistanceToNow(new Date(r.sent_at), { addSuffix: true }) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
