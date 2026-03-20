import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Copy, Check, ExternalLink, Trash2, Eye, Mail,
  Calendar, Building2, ClipboardList, ChevronDown,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface IntakeSubmission {
  id: string;
  org_id: string;
  created_at: string;
  status: "new" | "reviewed" | "converted";
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  company_name: string | null;
  form_data: Record<string, unknown>;
}

const STATUS_META: Record<string, { label: string; class: string }> = {
  new:       { label: "New",       class: "bg-rose-100 text-rose-700 border-rose-200" },
  reviewed:  { label: "Reviewed",  class: "bg-amber-100 text-amber-700 border-amber-200" },
  converted: { label: "Converted", class: "bg-green-100 text-green-700 border-green-200" },
};

// ── Detail section helper ──────────────────────────────────────────────────────
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <div className="bg-gray-50 rounded-lg p-4 space-y-2.5 border border-gray-100">{children}</div>
    </div>
  );
}
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Intake() {
  const { org } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<IntakeSubmission | null>(null);

  const intakeUrl = org ? `${window.location.origin}/intake/${org.id}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(intakeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ description: "Intake link copied!" });
  };

  // ── Fetch submissions ────────────────────────────────────────────────────────
  const { data: submissions = [], isLoading } = useQuery<IntakeSubmission[]>({
    queryKey: ["intake_submissions", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("intake_submissions")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IntakeSubmission[];
    },
    enabled: !!org,
  });

  // ── Update status ────────────────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("intake_submissions")
        .update({ status: status as "new" | "reviewed" | "converted" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intake_submissions"] }),
  });

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deleteSubmission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("intake_submissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake_submissions"] });
      setSelected(null);
      toast({ description: "Submission deleted." });
    },
  });

  const fd = (s: IntakeSubmission) => s.form_data as Record<string, string>;

  return (
    <AppShell>
      <Header title="Client Intake" />

      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Share card ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-100 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Your Intake Link</h2>
              <p className="text-sm text-gray-500 mb-3">
                Share this link with new prospects or clients. It opens a beautiful branded form — no login needed.
              </p>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-md">
                <span className="text-xs text-gray-500 truncate flex-1 font-mono">{intakeUrl}</span>
                <Button size="sm" variant="ghost" onClick={copyLink} className="h-7 w-7 p-0 shrink-0">
                  {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <Button size="sm" className="gap-1.5 bg-rose-500 hover:bg-rose-600" asChild>
                <a href={intakeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  Preview Form
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {(["new", "reviewed", "converted"] as const).map((s) => {
            const count = submissions.filter((x) => x.status === s).length;
            const m = STATUS_META[s];
            return (
              <div key={s} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold border", m.class)}>
                  {count}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-medium">{count === 1 ? "submission" : "submissions"}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Submissions
              <span className="ml-2 text-xs font-normal text-muted-foreground">{submissions.length} total</span>
            </h3>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading submissions…</div>
          ) : submissions.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">No submissions yet</p>
              <p className="text-xs text-gray-400 mt-1">Share the intake link above to start receiving briefs.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Received</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => setSelected(sub)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{sub.contact_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail size={10} />
                        {sub.contact_email ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{sub.company_name ?? "—"}</p>
                      {sub.contact_role && (
                        <p className="text-xs text-muted-foreground">{sub.contact_role}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={sub.status}
                        onValueChange={(v) => updateStatus.mutate({ id: sub.id, status: v })}
                      >
                        <SelectTrigger className={cn("h-7 text-xs border rounded-full px-2.5 w-28", STATUS_META[sub.status]?.class)}>
                          <SelectValue />
                          <ChevronDown size={11} className="ml-1 opacity-60" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="reviewed">Reviewed</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                        <Eye size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Detail modal ───────────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-lg font-bold">
                  {selected?.company_name ?? "Brief"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {selected?.contact_name} · {selected?.contact_email}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selected && (
                  <Badge className={cn("text-xs border", STATUS_META[selected.status]?.class)}>
                    {STATUS_META[selected.status]?.label}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => selected && deleteSubmission.mutate(selected.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
            {selected && (
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {new Date(selected.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}
                </span>
                {selected.contact_role && (
                  <span className="flex items-center gap-1">
                    <Building2 size={11} />
                    {selected.contact_role}
                  </span>
                )}
              </div>
            )}
          </DialogHeader>

          {selected && (
            <ScrollArea className="flex-1 px-6 py-5">
              <div className="space-y-5">
                <DetailSection title="Contact & Company">
                  <DetailRow label="Full Name"    value={selected.contact_name} />
                  <DetailRow label="Email"        value={selected.contact_email} />
                  <DetailRow label="Role / Title" value={selected.contact_role} />
                  <DetailRow label="Company"      value={selected.company_name} />
                  <DetailRow label="Website"      value={fd(selected).website} />
                </DetailSection>

                <Separator />

                <DetailSection title="Business">
                  <DetailRow label="Industry"       value={fd(selected).industry} />
                  <DetailRow label="Company Size"   value={fd(selected).company_size} />
                  <DetailRow label="Business Model" value={fd(selected).business_model} />
                  <DetailRow label="One-Liner"      value={fd(selected).one_liner} />
                </DetailSection>

                <Separator />

                <DetailSection title="Goals & Audience">
                  <DetailRow label="Goals"           value={fd(selected).goals} />
                  <DetailRow label="Ideal Customer"  value={fd(selected).ideal_customer} />
                  <DetailRow label="Top Pain Point"  value={fd(selected).top_problem} />
                  <DetailRow label="Timeline"        value={fd(selected).timeline} />
                </DetailSection>

                <Separator />

                <DetailSection title="Brand & Competition">
                  <DetailRow label="Competitors"     value={fd(selected).competitors} />
                  <DetailRow label="Differentiators" value={fd(selected).differentiators} />
                  <DetailRow label="Brand Tone"      value={fd(selected).tone} />
                  <DetailRow label="Extra Notes"     value={fd(selected).extra_notes} />
                </DetailSection>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
