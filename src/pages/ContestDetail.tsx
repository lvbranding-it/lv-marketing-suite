import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Copy, Check, ExternalLink, Plus, Pencil, Trash2,
  Trophy, Upload, X, Crown, ChevronDown,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  useContest, useContestants, useVoteCounts,
  useUpdateContest, useCreateContestant, useUpdateContestant, useDeleteContestant,
  normalizeContestPhotoUrl, uploadContestantPhoto, uploadContestLogo, slugify,
  type Contest, type Contestant,
} from "@/hooks/useContests";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<Contest["status"], string> = {
  draft:            "Draft",
  active:           "Active — accepting votes",
  closed:           "Closed — no more votes",
  winner_announced: "Winner Announced",
};
const STATUS_BADGE: Record<Contest["status"], string> = {
  draft:            "bg-gray-100 text-gray-600 border-gray-200",
  active:           "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed:           "bg-amber-100 text-amber-700 border-amber-200",
  winner_announced: "bg-violet-100 text-violet-700 border-violet-200",
};

// ── Contestant dialog ─────────────────────────────────────────────────────────

function ContestantDialog({
  contestId, existing, open, onOpenChange,
}: {
  contestId: string;
  existing:  Contestant | null;
  open:      boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const create    = useCreateContestant();
  const update    = useUpdateContestant();
  const [name, setName]         = useState(existing?.name ?? "");
  const [desc, setDesc]         = useState(existing?.description ?? "");
  const [photoUrl, setPhotoUrl] = useState(existing?.photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isEdit    = !!existing;
  const isPending = create.isPending || update.isPending;

  const handlePhoto = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadContestantPhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      toast({ variant: "destructive", description: "Photo upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (isEdit) {
        await update.mutateAsync({ id: existing.id, name: name.trim(), description: desc || null, photo_url: normalizeContestPhotoUrl(photoUrl) || null });
      } else {
        await create.mutateAsync({ contest_id: contestId, name: name.trim(), description: desc || null, photo_url: normalizeContestPhotoUrl(photoUrl) || null, display_order: 0 });
      }
      toast({ description: isEdit ? "Contestant updated." : "Contestant added." });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contestant" : "Add Contestant"}</DialogTitle>
          <DialogDescription>Each contestant gets a card on the public voting page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Photo */}
          <div className="space-y-2">
            <Label>Photo</Label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden shrink-0">
                {photoUrl
                  ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                  : <Trophy size={24} className="text-gray-300" />
                }
              </div>
              <div className="space-y-1.5 flex-1">
                <Input
                  placeholder="Paste image URL…"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(normalizeContestPhotoUrl(e.target.value) ?? "")}
                  className="text-xs"
                />
                <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-xs"
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload size={12} />
                  {uploading ? "Uploading…" : "Upload file"}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Name <span className="text-rose-500">*</span></Label>
            <Input placeholder="e.g. Maria's Bakery" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Short description</Label>
            <Textarea placeholder="What makes this entry special?" rows={2} className="resize-none text-sm"
              value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !name.trim()} className="bg-rose-500 hover:bg-rose-600 text-white">
              {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Contestant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Setup tab ─────────────────────────────────────────────────────────────────

function SetupTab({ contest }: { contest: Contest }) {
  const { toast }   = useToast();
  const update      = useUpdateContest();
  const logoRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState({
    title:           contest.title,
    description:     contest.description ?? "",
    voting_instructions: contest.voting_instructions ?? "",
    client_name:     contest.client_name ?? "",
    client_logo_url: contest.client_logo_url ?? "",
    brand_color:     contest.brand_color,
    brand_accent:    contest.brand_accent,
    voting_opens_at: contest.voting_opens_at?.slice(0, 16) ?? "",
    voting_closes_at: contest.voting_closes_at?.slice(0, 16) ?? "",
    status:          contest.status,
    results_public:  contest.results_public,
    slug:            contest.slug,
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id:              contest.id,
        title:           form.title,
        description:     form.description || null,
        voting_instructions: form.voting_instructions || null,
        client_name:     form.client_name || null,
        client_logo_url: normalizeContestPhotoUrl(form.client_logo_url) || null,
        brand_color:     form.brand_color,
        brand_accent:    form.brand_accent,
        voting_opens_at:  form.voting_opens_at  ? new Date(form.voting_opens_at).toISOString()  : null,
        voting_closes_at: form.voting_closes_at ? new Date(form.voting_closes_at).toISOString() : null,
        status:          form.status,
        results_public:  form.results_public,
        slug:            slugify(form.slug) || contest.slug,
      });
      toast({ description: "Contest saved." });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to save" });
    }
  };

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const url = await uploadContestLogo(file);
      set("client_logo_url", url);
      toast({ description: "Logo uploaded." });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Logo upload failed" });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Contest title</Label>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Client name</Label>
          <Input placeholder="e.g. Autism Moms of Houston" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Description</Label>
          <Textarea rows={2} className="resize-none text-sm" value={form.description}
            onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Voting instructions</Label>
          <Textarea
            rows={3}
            className="resize-none text-sm"
            placeholder="Tell voters how to choose an entry, enter their email, and confirm their vote."
            value={form.voting_instructions}
            onChange={(e) => set("voting_instructions", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Client logo</Label>
          <div className="flex items-center gap-3">
            <div className="h-12 w-16 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {form.client_logo_url
                ? <img src={form.client_logo_url} alt="" className="max-h-full max-w-full object-contain" />
                : <Upload size={18} className="text-gray-300" />
              }
            </div>
            <div className="flex-1 space-y-1.5">
              <Input placeholder="https://…" value={form.client_logo_url} onChange={(e) => set("client_logo_url", normalizeContestPhotoUrl(e.target.value) ?? "")} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
                  <Upload size={12} />
                  {uploadingLogo ? "Uploading..." : "Upload from computer"}
                </Button>
                {form.client_logo_url && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => set("client_logo_url", "")}>
                    <X size={12} /> Remove
                  </Button>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.currentTarget.value = ""; }} />
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>URL slug</Label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">/vote/</span>
            <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} className="font-mono text-sm" />
          </div>
        </div>
        {/* Brand colors */}
        <div className="space-y-1.5">
          <Label>Primary brand color</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.brand_color} onChange={(e) => set("brand_color", e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5" />
            <Input value={form.brand_color} onChange={(e) => set("brand_color", e.target.value)} className="font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Accent / dark color</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.brand_accent} onChange={(e) => set("brand_accent", e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5" />
            <Input value={form.brand_accent} onChange={(e) => set("brand_accent", e.target.value)} className="font-mono text-sm" />
          </div>
        </div>
        {/* Dates */}
        <div className="space-y-1.5">
          <Label>Voting opens</Label>
          <Input type="datetime-local" value={form.voting_opens_at} onChange={(e) => set("voting_opens_at", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Voting closes</Label>
          <Input type="datetime-local" value={form.voting_closes_at} onChange={(e) => set("voting_closes_at", e.target.value)} />
        </div>
        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(STATUS_LABELS) as [Contest["status"], string][]).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Results public */}
        <div className="space-y-1.5">
          <Label>Show live vote counts during voting</Label>
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={form.results_public} onCheckedChange={(v) => set("results_public", v)} />
            <span className="text-sm text-muted-foreground">
              {form.results_public ? "Visible to voters" : "Hidden until voting closes"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending} className="bg-rose-500 hover:bg-rose-600 text-white">
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Contestants tab ───────────────────────────────────────────────────────────

function ContestantsTab({ contest }: { contest: Contest }) {
  const { toast }  = useToast();
  const { data: contestants = [] } = useContestants(contest.id);
  const { data: counts = {} }      = useVoteCounts(contest.id);
  const del = useDeleteContestant();
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<Contestant | null>(null);

  const handleDelete = async (c: Contestant) => {
    if (!confirm(`Remove "${c.name}"? Their votes will also be deleted.`)) return;
    try {
      await del.mutateAsync({ id: c.id, contestId: contest.id });
      toast({ description: "Contestant removed." });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{contestants.length} contestant{contestants.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => { setEditTarget(null); setDialogOpen(true); }}
          className="gap-1.5 bg-rose-500 hover:bg-rose-600 text-white">
          <Plus size={13} /> Add Contestant
        </Button>
      </div>

      {contestants.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed rounded-xl">
          <Trophy size={32} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No contestants yet — add the first entry.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {contestants.map((c) => {
            const voteCount = counts[c.id] ?? 0;
            const isWinner  = contest.winner_contestant_id === c.id;
            return (
              <div key={c.id} className={cn(
                "bg-white border rounded-xl overflow-hidden",
                isWinner ? "border-violet-300 ring-1 ring-violet-200" : "border-border"
              )}>
                {/* Photo */}
                <div className="h-40 bg-gray-100 relative overflow-hidden">
                  {c.photo_url
                    ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-300"><Trophy size={36} /></div>
                  }
                  {isWinner && (
                    <div className="absolute top-2 right-2 bg-violet-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Crown size={10} /> Winner
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-3">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.description}</p>}
                  <p className="text-xs font-medium mt-2" style={{ color: contest.brand_color }}>
                    {voteCount} vote{voteCount !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-1 mt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 flex-1"
                      onClick={() => { setEditTarget(c); setDialogOpen(true); }}>
                      <Pencil size={11} /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)}>
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ContestantDialog
        contestId={contest.id}
        existing={editTarget}
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditTarget(null); }}
      />
    </div>
  );
}

// ── Votes tab ─────────────────────────────────────────────────────────────────

function VotesTab({ contest }: { contest: Contest }) {
  const { toast } = useToast();
  const update    = useUpdateContest();
  const { data: contestants = [] } = useContestants(contest.id);
  const { data: counts = {} }      = useVoteCounts(contest.id, true);

  const totalVotes = Object.values(counts).reduce((s, n) => s + n, 0);
  const sorted     = [...contestants].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  const leader     = sorted[0];

  const announceWinner = async () => {
    if (!leader) return;
    if (!confirm(`Announce "${leader.name}" as the winner? This updates the contest status publicly.`)) return;
    try {
      await update.mutateAsync({ id: contest.id, status: "winner_announced", winner_contestant_id: leader.id });
      toast({ description: `${leader.name} announced as winner! 🏆` });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-3xl font-bold">{totalVotes}</p>
          <p className="text-xs text-muted-foreground">Total verified votes</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-3xl font-bold">{contestants.length}</p>
          <p className="text-xs text-muted-foreground">Contestants</p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="space-y-2.5">
        {sorted.map((c, i) => {
          const v    = counts[c.id] ?? 0;
          const pct  = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
          const isWinner = contest.winner_contestant_id === c.id;
          return (
            <div key={c.id} className={cn(
              "flex items-center gap-3 bg-white border rounded-xl p-3",
              isWinner && "border-violet-300 ring-1 ring-violet-100"
            )}>
              <span className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                i === 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
              )}>
                {isWinner ? <Crown size={13} className="text-violet-600" /> : i + 1}
              </span>
              {c.photo_url && (
                <img src={c.photo_url} alt={c.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Progress value={pct} className="h-1.5 flex-1" />
                  <span className="text-xs text-muted-foreground shrink-0">{v} ({pct}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {contest.status === "closed" && !contest.winner_contestant_id && leader && (
        <div className="flex justify-center pt-2">
          <Button onClick={announceWinner} disabled={update.isPending}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
            <Crown size={14} /> Announce {leader.name} as Winner
          </Button>
        </div>
      )}

      {contest.status === "winner_announced" && contest.winner_contestant_id && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <Crown size={20} className="text-violet-600 shrink-0" />
          <div>
            <p className="font-semibold text-violet-800">
              {contestants.find((c) => c.id === contest.winner_contestant_id)?.name} — Winner 🏆
            </p>
            <p className="text-xs text-violet-600">The winner has been announced publicly.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Embed tab ─────────────────────────────────────────────────────────────────

function EmbedTab({ contest }: { contest: Contest }) {
  const [copied, setCopied] = useState<"link" | "embed" | "simple" | null>(null);
  const [embedOptions, setEmbedOptions] = useState({
    layout: "full",
    info: true,
    photos: true,
    branding: true,
    transparent: false,
  });

  const votingUrl  = `${window.location.origin}/vote/${contest.slug}`;
  const embedParams = new URLSearchParams();
  if (embedOptions.layout === "compact") embedParams.set("layout", "compact");
  if (!embedOptions.info) embedParams.set("info", "false");
  if (!embedOptions.photos) embedParams.set("photos", "false");
  if (!embedOptions.branding) embedParams.set("branding", "false");
  if (embedOptions.transparent) embedParams.set("bg", "transparent");
  const embedQuery = embedParams.toString();
  const embedSrc   = `${window.location.origin}/embed/${contest.slug}${embedQuery ? `?${embedQuery}` : ""}`;
  const iframeId   = `lv-contest-${contest.slug}`;
  const titleAttr  = `${contest.title} Results`.replace(/"/g, "&quot;");
  const simpleEmbedCode = `<iframe src="${embedSrc}" width="100%" height="320" loading="lazy" style="width:100%;max-width:620px;min-height:220px;border:0;border-radius:14px;display:block;overflow:hidden;margin:0 auto;" title="${titleAttr}"></iframe>`;
  const embedCode  = `<iframe id="${iframeId}" src="${embedSrc}" width="100%" height="320" loading="lazy" style="width:100%;max-width:620px;min-height:220px;border:0;border-radius:14px;display:block;overflow:hidden;margin:0 auto;" title="${titleAttr}"></iframe>
<script>
  window.addEventListener("message", function(event) {
    if (!event.data || event.data.type !== "lv-contest-widget-height" || event.data.slug !== "${contest.slug}") return;
    var iframe = document.getElementById("${iframeId}");
    if (iframe && event.data.height) iframe.style.height = Math.max(220, event.data.height) + "px";
  });
</script>`;

  const copy = (text: string, which: "link" | "embed" | "simple") => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const setEmbed = (k: keyof typeof embedOptions, v: string | boolean) =>
    setEmbedOptions((opts) => ({ ...opts, [k]: v }));

  return (
    <div className="space-y-6">
      {/* Voting link */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Voting Page Link</Label>
        <p className="text-xs text-muted-foreground">Share this with your client's audience. Opens the branded voting form.</p>
        <div className="flex items-center gap-2 bg-muted/50 border rounded-lg px-3 py-2">
          <span className="text-xs font-mono flex-1 truncate text-muted-foreground">{votingUrl}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(votingUrl, "link")}>
            {copied === "link" ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
            <a href={votingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /></a>
          </Button>
        </div>
      </div>

      {/* Embed code */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Results Widget (Embed)</Label>
        <p className="text-xs text-muted-foreground">
          Paste this into any page on your client's website to show live vote counts. The smart version auto-resizes in most Wix, WordPress, and custom HTML blocks.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Layout</Label>
            <Select value={embedOptions.layout} onValueChange={(v) => setEmbed("layout", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full leaderboard</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
            <Label className="text-xs">Show event info</Label>
            <Switch checked={embedOptions.info} onCheckedChange={(v) => setEmbed("info", v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
            <Label className="text-xs">Show photos</Label>
            <Switch checked={embedOptions.photos} onCheckedChange={(v) => setEmbed("photos", v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
            <Label className="text-xs">LV Branding footer</Label>
            <Switch checked={embedOptions.branding} onCheckedChange={(v) => setEmbed("branding", v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
            <Label className="text-xs">Transparent background</Label>
            <Switch checked={embedOptions.transparent} onCheckedChange={(v) => setEmbed("transparent", v)} />
          </div>
        </div>
        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {embedCode}
          </pre>
          <Button size="sm" variant="secondary" className="absolute top-2 right-2 gap-1.5 text-xs h-7"
            onClick={() => copy(embedCode, "embed")}>
            {copied === "embed" ? <><Check size={11} className="text-green-500" /> Copied!</> : <><Copy size={11} /> Copy</>}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
            <a href={embedSrc} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={11} /> Preview Widget
            </a>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => copy(simpleEmbedCode, "simple")}>
            {copied === "simple" ? <><Check size={11} className="text-green-500" /> Copied fallback</> : <><Copy size={11} /> Copy iframe only</>}
          </Button>
        </div>
      </div>

      {/* Status note */}
      {contest.status === "draft" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
          ⚠️ The voting page is not yet public. Change the status to <strong>Active</strong> to open voting.
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ContestDetail() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const { data: contest, isLoading } = useContest(id);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
      </AppShell>
    );
  }

  if (!contest) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-muted-foreground">Contest not found.</p>
          <Button variant="outline" onClick={() => navigate("/contests")}>Back to Contests</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="border-b border-border px-6 py-4 flex items-center gap-3 bg-background">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/contests")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{contest.title}</h1>
          <p className="text-xs text-muted-foreground">{contest.client_name ?? "LV Branding"}</p>
        </div>
        <Badge className={cn("text-xs border shrink-0", STATUS_BADGE[contest.status])}>
          {STATUS_LABELS[contest.status]}
        </Badge>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <Tabs defaultValue="setup">
          <TabsList className="mb-6">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="contestants">Contestants</TabsTrigger>
            <TabsTrigger value="votes">Votes</TabsTrigger>
            <TabsTrigger value="embed">Embed</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">     <SetupTab       contest={contest} /></TabsContent>
          <TabsContent value="contestants"><ContestantsTab contest={contest} /></TabsContent>
          <TabsContent value="votes">     <VotesTab       contest={contest} /></TabsContent>
          <TabsContent value="embed">     <EmbedTab       contest={contest} /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
