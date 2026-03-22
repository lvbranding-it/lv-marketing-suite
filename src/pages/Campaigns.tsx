import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import {
  Mail, Plus, Send, BarChart2, Users, MousePointerClick,
  AlertTriangle, Trash2, Loader2, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCampaigns, useDeleteCampaign, type EmailCampaign } from "@/hooks/useCampaigns";
import { useToast } from "@/hooks/use-toast";

const STATUS_META: Record<string, { label: string; class: string }> = {
  draft:   { label: "Draft",   class: "bg-slate-100 text-slate-600 border-slate-200" },
  sending: { label: "Sending", class: "bg-amber-100 text-amber-700 border-amber-200" },
  sent:    { label: "Sent",    class: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed:  { label: "Failed",  class: "bg-red-100 text-red-600 border-red-200" },
};

function rate(num: number, denom: number) {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

function CampaignCard({
  campaign,
  onDelete,
}: {
  campaign: EmailCampaign;
  onDelete: (c: EmailCampaign) => void;
}) {
  const navigate = useNavigate();
  const status = STATUS_META[campaign.status] ?? STATUS_META.draft;

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 sm:p-5 hover:shadow-sm transition-shadow cursor-pointer group"
      onClick={() => navigate(`/campaigns/${campaign.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn("text-[10px] border px-1.5 py-0.5 rounded-full font-medium", status.class)}>
              {status.label}
            </span>
            {campaign.sent_at && (
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(campaign.sent_at), "MMM d, yyyy")}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold truncate">{campaign.name}</h3>
          {campaign.subject && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{campaign.subject}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(campaign); }}
          className="shrink-0 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Stats row */}
      {campaign.status === "sent" ? (
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border">
          <Stat label="Sent"        value={campaign.sent_count}                             icon={<Send size={10} />} />
          <Stat label="Opens"       value={rate(campaign.open_count, campaign.sent_count)}  icon={<BarChart2 size={10} />} color="text-blue-600" />
          <Stat label="Clicks"      value={rate(campaign.click_count, campaign.sent_count)} icon={<MousePointerClick size={10} />} color="text-emerald-600" />
          <Stat label="Unsub"       value={campaign.unsubscribe_count}                      icon={<AlertTriangle size={10} />} color="text-amber-600" />
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Users size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {campaign.recipient_count} recipient{campaign.recipient_count !== 1 ? "s" : ""}
          </span>
          {campaign.status === "sending" && (
            <Loader2 size={12} className="animate-spin text-amber-500 ml-auto" />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, icon, color = "text-foreground",
}: {
  label: string; value: string | number; icon: React.ReactNode; color?: string;
}) {
  return (
    <div className="text-center">
      <div className={cn("text-sm font-bold", color)}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5 flex items-center justify-center gap-0.5">
        {icon}{label}
      </div>
    </div>
  );
}

export default function Campaigns() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: campaigns = [], isLoading } = useCampaigns();
  const deleteCampaign = useDeleteCampaign();
  const [deleteTarget, setDeleteTarget] = useState<EmailCampaign | null>(null);

  const sentCampaigns = campaigns.filter((c) => c.status === "sent");
  const totalSent     = sentCampaigns.reduce((s, c) => s + c.sent_count, 0);
  const totalOpens    = sentCampaigns.reduce((s, c) => s + c.open_count, 0);
  const totalClicks   = sentCampaigns.reduce((s, c) => s + c.click_count, 0);
  const avgOpenRate   = totalSent ? Math.round((totalOpens / totalSent) * 100) : 0;
  const avgClickRate  = totalSent ? Math.round((totalClicks / totalSent) * 100) : 0;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCampaign.mutateAsync(deleteTarget.id);
    toast({ description: `"${deleteTarget.name}" deleted.` });
    setDeleteTarget(null);
  };

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Email Campaigns</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Compose, send, and track email blasts</p>
        </div>
        <Button onClick={() => navigate("/campaigns/new")} className="gap-2">
          <Plus size={15} /> New Campaign
        </Button>
      </div>

      {/* Summary stats */}
      {sentCampaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: "Total Sent",   value: totalSent,           icon: <Send size={14} /> },
            { label: "Campaigns",    value: sentCampaigns.length, icon: <Mail size={14} /> },
            { label: "Avg Open Rate",value: `${avgOpenRate}%`,    icon: <BarChart2 size={14} />, color: "text-blue-600" },
            { label: "Avg CTR",      value: `${avgClickRate}%`,   icon: <TrendingUp size={14} />, color: "text-emerald-600" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                {s.icon}
                <span className="text-[10px] uppercase tracking-widest">{s.label}</span>
              </div>
              <p className={cn("text-2xl font-bold", s.color ?? "")}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Campaign list */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail size={32} className="text-primary" />
          </div>
          <div>
            <p className="text-base font-semibold">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Create your first AI-powered email campaign to start reaching your contacts.
            </p>
          </div>
          <Button onClick={() => navigate("/campaigns/new")} className="gap-2">
            <Plus size={15} /> Create Campaign
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
