import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Trophy, Plus, ExternalLink, Trash2, ChevronRight,
  Users, BarChart2, Circle,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useContests, useCreateContest, useDeleteContest, slugify, type Contest } from "@/hooks/useContests";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Status meta ───────────────────────────────────────────────────────────────

const STATUS: Record<Contest["status"], { label: string; class: string }> = {
  draft:            { label: "Draft",            class: "bg-gray-100 text-gray-600 border-gray-200" },
  active:           { label: "Active",           class: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  closed:           { label: "Closed",           class: "bg-amber-100 text-amber-700 border-amber-200" },
  winner_announced: { label: "Winner Announced", class: "bg-violet-100 text-violet-700 border-violet-200" },
};

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate     = useNavigate();
  const create       = useCreateContest();
  const { toast }    = useToast();
  const [title, setTitle]       = useState("");
  const [client, setClient]     = useState("");
  const [slug, setSlug]         = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    try {
      const contest = await create.mutateAsync({
        slug:                slug.trim(),
        title:               title.trim(),
        description:         null,
        voting_instructions: null,
        client_name:         client.trim() || null,
        client_logo_url:     null,
        brand_color:         "#CB2039",
        brand_accent:        "#1A1A2E",
        voting_opens_at:     null,
        voting_closes_at:    null,
        status:              "draft",
        results_public:      true,
        winner_contestant_id: null,
      });
      toast({ description: "Contest created!" });
      onOpenChange(false);
      navigate(`/contests/${contest.id}`);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to create contest" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy size={16} className="text-rose-500" /> New Contest
          </DialogTitle>
          <DialogDescription>Create a new voting contest for a client.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Contest title <span className="text-rose-500">*</span></Label>
            <Input
              placeholder="e.g. Best Vendor 2025"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Client name</Label>
            <Input
              placeholder="e.g. Autism Moms of Houston"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Voting page slug <span className="text-rose-500">*</span></Label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">/vote/</span>
              <Input
                placeholder="best-vendor-2025"
                value={slug}
                onChange={(e) => { setSlug(slugify(e.target.value)); setSlugEdited(true); }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Public URL: /vote/<strong>{slug || "…"}</strong>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !title.trim() || !slug.trim()}
              className="bg-rose-500 hover:bg-rose-600 text-white">
              {create.isPending ? "Creating…" : "Create Contest"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Contests() {
  const navigate      = useNavigate();
  const { toast }     = useToast();
  const { data: contests = [], isLoading } = useContests();
  const deleteContest = useDeleteContest();
  const [showCreate, setShowCreate] = useState(false);

  const stats = {
    total:  contests.length,
    active: contests.filter((c) => c.status === "active").length,
    draft:  contests.filter((c) => c.status === "draft").length,
    closed: contests.filter((c) => c.status === "closed" || c.status === "winner_announced").length,
  };

  const handleDelete = async (c: Contest, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${c.title}"? This will remove all votes and contestants.`)) return;
    try {
      await deleteContest.mutateAsync(c.id);
      toast({ description: "Contest deleted." });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to delete" });
    }
  };

  return (
    <AppShell>
      <Header title="Contests" />

      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Hero bar ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Voting contests for your clients</h2>
            <p className="text-sm text-muted-foreground">
              Create branded voting pages, collect email-verified votes, and embed live results on any website.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5 bg-rose-500 hover:bg-rose-600 text-white shrink-0">
            <Plus size={14} /> New Contest
          </Button>
        </div>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active",  value: stats.active, color: "text-emerald-600" },
            { label: "Draft",   value: stats.draft,  color: "text-gray-500" },
            { label: "Closed",  value: stats.closed, color: "text-amber-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
              <Circle size={10} className={cn("shrink-0 fill-current", color)} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b">
            <h3 className="text-sm font-semibold">All Contests
              <span className="ml-2 text-xs font-normal text-muted-foreground">{stats.total} total</span>
            </h3>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : contests.length === 0 ? (
            <div className="p-12 text-center">
              <Trophy size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">No contests yet</p>
              <p className="text-xs text-gray-400 mt-1">Create your first contest to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Contest</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Voting closes</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {contests.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/contests/${c.id}`)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">/vote/{c.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.client_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {c.voting_closes_at
                        ? formatDistanceToNow(new Date(c.voting_closes_at), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs border", STATUS[c.status].class)}>
                        {STATUS[c.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                          onClick={(e) => handleDelete(c, e)}>
                          <Trash2 size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          onClick={() => navigate(`/contests/${c.id}`)}>
                          <ChevronRight size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateDialog open={showCreate} onOpenChange={setShowCreate} />
    </AppShell>
  );
}
