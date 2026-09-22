import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight,
  CircleDot, Clock3, Copy, ExternalLink, Facebook, FileImage, Instagram,
  LayoutGrid, Link2, ListFilter, Loader2, MoreHorizontal, Plus, RefreshCw,
  RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/useOrg";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCreateSocialPost, useSocialAction, useSocialPublisherData,
  type ComposerDraft, type SocialAccount, type SocialPost, type SocialVariant,
} from "@/hooks/useSocialPublisher";
import {
  defaultScheduleValue, formatSocialDate, META_PERMISSIONS, SOCIAL_STATUS_META,
  validateSocialDraft, type SocialPlatform, type SocialWorkflowStatus,
} from "@/lib/socialPublisher";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const TIMEZONE = "America/Chicago";
const EMPTY_DRAFT: ComposerDraft = {
  title: "", notes: "", accountIds: [], facebookCaption: "", instagramCaption: "",
  facebookFormat: "image", instagramFormat: "image", linkUrl: "",
  scheduledLocal: defaultScheduleValue(), timezone: TIMEZONE, files: [],
};

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return platform === "facebook"
    ? <Facebook className={cn("text-[#1877F2]", className)} />
    : <Instagram className={cn("text-[#C13584]", className)} />;
}

function StatusBadge({ status }: { status: string }) {
  const meta = SOCIAL_STATUS_META[status as SocialWorkflowStatus] || SOCIAL_STATUS_META.draft;
  return <Badge variant="outline" className={cn("font-medium", meta.className)}>{meta.label}</Badge>;
}

function Metric({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: "default" | "red" | "green" }) {
  return (
    <Card className="overflow-hidden shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className={cn("mt-2 text-3xl font-semibold tracking-tight", tone === "red" && "text-red-600", tone === "green" && "text-emerald-600")}>{value}</p>
          </div>
          <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", tone === "red" ? "bg-red-500" : tone === "green" ? "bg-emerald-500" : "bg-blue-500")} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function AccountPill({ account }: { account: SocialAccount }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
        {account.profile_image_url ? <img src={account.profile_image_url} alt="" className="h-full w-full object-cover" /> : <PlatformIcon platform={account.platform} className="h-4 w-4" />}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-background bg-background">
          <PlatformIcon platform={account.platform} className="h-3 w-3" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{account.display_name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{account.username ? `@${account.username}` : account.platform === "facebook" ? "Facebook Page" : "Instagram professional"}</p>
      </div>
    </div>
  );
}

function VariantPreview({ variant, compact = false }: { variant: SocialVariant; compact?: boolean }) {
  const asset = variant.social_post_assets?.[0];
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between gap-2">
        <AccountPill account={variant.social_accounts} />
        <PlatformIcon platform={variant.platform} className="h-4 w-4 shrink-0" />
      </div>
      {asset && !compact && (
        <div className="mt-3 aspect-[16/9] overflow-hidden rounded-lg bg-muted">
          {asset.media_type === "video" ? <video src={asset.public_url} className="h-full w-full object-cover" muted /> : <img src={asset.public_url} alt="Post media" className="h-full w-full object-cover" />}
        </div>
      )}
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", compact ? "mt-2 line-clamp-2 text-xs" : "mt-3 line-clamp-4")}>{variant.caption || <span className="text-muted-foreground">No caption</span>}</p>
      {!compact && <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span className="capitalize">{variant.format}</span><span>{variant.caption.length} characters</span></div>}
    </div>
  );
}

function ComposerDialog({ open, onOpenChange, accounts, timezone, approvalRequired, canSchedule = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; accounts: SocialAccount[]; timezone: string; approvalRequired: boolean; canSchedule?: boolean;
}) {
  const { org } = useOrg();
  const { toast } = useToast();
  const createPost = useCreateSocialPost();
  const storageKey = `lv-social-composer:${org?.id || "unknown"}`;
  const [draft, setDraft] = useState<ComposerDraft>(() => ({ ...EMPTY_DRAFT, timezone }));
  const [schedule, setSchedule] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setDraft({ ...EMPTY_DRAFT, ...JSON.parse(saved), files: [], timezone });
      else setDraft((current) => ({ ...current, timezone }));
    } catch { /* Keep a clean draft. */ }
  }, [open, storageKey, timezone]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify({ ...draft, files: [] }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, open, storageKey]);

  const selected = accounts.filter((account) => draft.accountIds.includes(account.id));
  const formats = Object.fromEntries(selected.map((account) => [account.platform, account.platform === "facebook" ? draft.facebookFormat : draft.instagramFormat]));
  const submit = async () => {
    const validation = validateSocialDraft({
      title: draft.title, accountIds: draft.accountIds,
      captions: { facebook: draft.facebookCaption, instagram: draft.instagramCaption },
      formats, files: draft.files, scheduledLocal: schedule ? draft.scheduledLocal : undefined,
    });
    if (validation.length) return setErrors(validation);
    try {
      await createPost.mutateAsync({ draft, schedule });
      localStorage.removeItem(storageKey);
      setDraft({ ...EMPTY_DRAFT, timezone });
      setErrors([]);
      onOpenChange(false);
      toast({ description: schedule ? "Post scheduled for both channels." : "Draft saved." });
    } catch (error) {
      toast({ variant: "destructive", description: error instanceof Error ? error.message : "Unable to save this post." });
    }
  };
  const toggleAccount = (id: string) => setDraft((current) => ({
    ...current, accountIds: current.accountIds.includes(id) ? current.accountIds.filter((value) => value !== id) : [...current.accountIds, id],
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Create social post</DialogTitle>
          <DialogDescription>One idea, tailored independently for every destination.</DialogDescription>
        </DialogHeader>
        <div className="grid lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-6 p-6 lg:border-r">
            <div className="space-y-2"><Label htmlFor="social-title">Internal title</Label><Input id="social-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="September brand story" /></div>
            <div className="space-y-2">
              <Label>Destinations</Label>
              {accounts.length ? <div className="grid gap-2 sm:grid-cols-2">{accounts.filter((account) => account.status === "active").map((account) => (
                <button type="button" key={account.id} onClick={() => toggleAccount(account.id)} className={cn("flex items-center justify-between rounded-xl border p-3 text-left transition", draft.accountIds.includes(account.id) ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
                  <AccountPill account={account} />{draft.accountIds.includes(account.id) && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}</div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Connect Meta to choose a Page or Instagram account.</div>}
            </div>
            {selected.some((account) => account.platform === "facebook") && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between"><Label className="flex items-center gap-2"><Facebook className="h-4 w-4 text-[#1877F2]" />Facebook version</Label><Select value={draft.facebookFormat} onValueChange={(value) => setDraft({ ...draft, facebookFormat: value })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="link">Link</SelectItem><SelectItem value="image">Image</SelectItem><SelectItem value="video">Video</SelectItem></SelectContent></Select></div>
                <Textarea value={draft.facebookCaption} onChange={(event) => setDraft({ ...draft, facebookCaption: event.target.value })} rows={5} placeholder="Write the Facebook caption…" />
                {draft.facebookFormat === "link" && <Input type="url" value={draft.linkUrl} onChange={(event) => setDraft({ ...draft, linkUrl: event.target.value })} placeholder="https://…" />}
              </div>
            )}
            {selected.some((account) => account.platform === "instagram") && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between"><Label className="flex items-center gap-2"><Instagram className="h-4 w-4 text-[#C13584]" />Instagram version</Label><Select value={draft.instagramFormat} onValueChange={(value) => setDraft({ ...draft, instagramFormat: value })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="image">Feed image</SelectItem><SelectItem value="carousel">Carousel</SelectItem><SelectItem value="reel">Reel</SelectItem></SelectContent></Select></div>
                <Textarea value={draft.instagramCaption} onChange={(event) => setDraft({ ...draft, instagramCaption: event.target.value })} rows={5} placeholder="Write the Instagram caption and hashtags…" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Media</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"><Upload className="h-4 w-4" />Choose images or video<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="sr-only" onChange={(event) => setDraft({ ...draft, files: Array.from(event.target.files || []) })} /></label>
              {draft.files.length > 0 && <div className="flex flex-wrap gap-2">{draft.files.map((file) => <Badge key={`${file.name}-${file.size}`} variant="secondary" className="gap-1"><FileImage className="h-3 w-3" />{file.name}</Badge>)}</div>}
            </div>
            <div className="space-y-2"><Label>Internal notes</Label><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} placeholder="Context for reviewers (never published)" /></div>
          </div>
          <div className="space-y-5 bg-muted/30 p-6">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Live preview</p><p className="mt-1 text-sm text-muted-foreground">Previews approximate the final platform layout.</p></div>
            {selected.length ? selected.map((account) => <VariantPreview key={account.id} variant={{ id: account.id, platform: account.platform, format: account.platform === "facebook" ? draft.facebookFormat : draft.instagramFormat, caption: account.platform === "facebook" ? draft.facebookCaption : draft.instagramCaption, scheduled_for_utc: null, publication_status: "draft", provider_post_id: null, provider_permalink: null, social_account_id: account.id, social_accounts: account, social_post_assets: [], social_publish_jobs: [] }} />) : <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-background p-6 text-center"><div><LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 text-sm text-muted-foreground">Select a destination to see its preview.</p></div></div>}
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Schedule this post</p><p className="text-xs text-muted-foreground">Times shown in {timezone}</p></div><Switch checked={schedule} disabled={approvalRequired || !canSchedule} onCheckedChange={setSchedule} /></div>
              {(approvalRequired || !canSchedule) && <p className="mt-2 text-xs text-amber-700">{approvalRequired ? "Approval is required. Save and submit the draft before scheduling." : "A manager or administrator must schedule the draft."}</p>}
              {schedule && <Input type="datetime-local" className="mt-3" value={draft.scheduledLocal} onChange={(event) => setDraft({ ...draft, scheduledLocal: event.target.value })} />}
            </div>
            {errors.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors.map((error) => <p key={error} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>)}</div>}
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={createPost.isPending || !accounts.length}>{createPost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{schedule ? "Schedule post" : "Save draft"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ post, open, onOpenChange, onSchedule, pending }: { post: SocialPost | null; open: boolean; onOpenChange: (open: boolean) => void; onSchedule: (value: string) => void; pending: boolean }) {
  const [value, setValue] = useState(defaultScheduleValue());
  useEffect(() => { if (open) setValue(defaultScheduleValue()); }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Schedule “{post?.title}”</DialogTitle><DialogDescription>Every channel gets an independent job at this time. Times are shown in {post?.scheduled_timezone || TIMEZONE}.</DialogDescription></DialogHeader><div className="py-3"><Label htmlFor="approved-schedule">Publish date and time</Label><Input id="approved-schedule" type="datetime-local" className="mt-2" value={value} onChange={(event) => setValue(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSchedule(value)} disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Schedule channels</Button></DialogFooter></DialogContent></Dialog>;
}

function PostCard({ post, canApprove, canSchedule, onAction, onDuplicate, onSchedule, onRetry }: {
  post: SocialPost; canApprove: boolean; canSchedule: boolean; onAction: (action: string) => void; onDuplicate: () => void; onSchedule: () => void; onRetry: (jobId: string) => void;
}) {
  const next = post.social_post_variants.map((variant) => variant.scheduled_for_utc).filter(Boolean).sort()[0];
  const failedJob = post.social_post_variants.flatMap((variant) => variant.social_publish_jobs || []).find((job) => job.status === "failed");
  return (
    <Card className="group shadow-none transition hover:border-foreground/20 hover:shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={post.workflow_status} /><span className="text-[11px] text-muted-foreground">Updated {format(new Date(post.updated_at), "MMM d")}</span></div><CardTitle className="mt-2 truncate text-base">{post.title}</CardTitle></div><Button variant="ghost" size="icon" onClick={onDuplicate} title="Duplicate"><Copy className="h-4 w-4" /></Button></div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("grid gap-3", post.social_post_variants.length > 1 && "sm:grid-cols-2")}>{post.social_post_variants.map((variant) => <VariantPreview key={variant.id} variant={variant} compact />)}</div>
        {next && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{formatSocialDate(next, post.scheduled_timezone)} · {post.scheduled_timezone}</p>}
        {failedJob?.last_error_message_safe && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><p className="font-medium">{failedJob.last_error_category === "authentication" ? "Reconnect Meta to continue" : "Publishing failed"}</p><p className="mt-1">{failedJob.last_error_message_safe}</p></div>}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {["draft", "changes_requested"].includes(post.workflow_status) && <Button size="sm" variant="outline" onClick={() => onAction("submit")}><Send className="mr-1.5 h-3.5 w-3.5" />Submit for review</Button>}
          {post.workflow_status === "in_review" && canApprove && <><Button size="sm" onClick={() => onAction("approve")}><Check className="mr-1.5 h-3.5 w-3.5" />Approve</Button><Button size="sm" variant="outline" onClick={() => onAction("request_changes")}>Request changes</Button></>}
          {["approved", "draft", "changes_requested"].includes(post.workflow_status) && canSchedule && <Button size="sm" variant="outline" onClick={onSchedule}><CalendarDays className="mr-1.5 h-3.5 w-3.5" />Schedule</Button>}
          {failedJob && canApprove && <Button size="sm" variant="outline" onClick={() => onRetry(failedJob.id)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry failed channel</Button>}
          {post.workflow_status === "published" && post.social_post_variants.some((variant) => variant.provider_permalink) && <Button size="sm" variant="ghost" asChild><a href={post.social_post_variants.find((variant) => variant.provider_permalink)?.provider_permalink || "#"} target="_blank" rel="noreferrer">Open post<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function EditorialCalendar({ posts, timezone }: { posts: SocialPost[]; timezone: string }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month)); const end = endOfWeek(endOfMonth(month)); const result: Date[] = [];
    for (let day = start; day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) result.push(day);
    return result;
  }, [month]);
  const scheduled = posts.flatMap((post) => post.social_post_variants.filter((variant) => variant.scheduled_for_utc).map((variant) => ({ post, variant, date: new Date(variant.scheduled_for_utc!) })));
  return <Card className="shadow-none"><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">{format(month, "MMMM yyyy")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Publishing times shown in {timezone}</p></div><div className="flex gap-1"><Button size="icon" variant="outline" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button><Button size="icon" variant="outline" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button></div></CardHeader><CardContent><div className="grid grid-cols-7 border-l border-t">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <div key={label} className="border-b border-r bg-muted/40 p-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>)}{days.map((day) => { const items = scheduled.filter((item) => isSameDay(item.date, day)); return <div key={day.toISOString()} className={cn("min-h-28 border-b border-r p-2", !isSameMonth(day, month) && "bg-muted/20 text-muted-foreground")}><div className={cn("mb-2 grid h-6 w-6 place-items-center rounded-full text-xs", isSameDay(day, new Date()) && "bg-primary font-semibold text-primary-foreground")}>{format(day, "d")}</div><div className="space-y-1">{items.slice(0, 3).map(({ post, variant }) => <div key={variant.id} className={cn("rounded border-l-2 bg-muted px-2 py-1 text-[10px]", variant.platform === "facebook" ? "border-l-blue-500" : "border-l-pink-500")}><p className="truncate font-medium">{post.title}</p><p className="text-muted-foreground">{formatSocialDate(variant.scheduled_for_utc!, timezone, { hour: "numeric", minute: "2-digit" })}</p></div>)}{items.length > 3 && <p className="text-[10px] text-muted-foreground">+{items.length - 3} more</p>}</div></div>; })}</div></CardContent></Card>;
}

function ConnectionsPanel({ accounts, connection, canManage, approvalRequired, onApprovalChange, onAccountSelection, onConnect, onSync, onDisconnect, busy }: { accounts: SocialAccount[]; connection: any; canManage: boolean; approvalRequired: boolean; onApprovalChange: (value: boolean) => void; onAccountSelection: (accountId: string, selected: boolean) => void; onConnect: () => void; onSync: () => void; onDisconnect: () => void; busy: boolean }) {
  return <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><Card className="shadow-none"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-base">Meta connection</CardTitle><p className="mt-1 text-sm text-muted-foreground">Official Facebook and Instagram publishing access</p></div>{connection ? <Badge variant="outline" className={cn("gap-1.5", connection.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}><CircleDot className="h-3 w-3" />{connection.status === "active" ? "Healthy" : "Action required"}</Badge> : <Badge variant="outline">Not connected</Badge>}</div></CardHeader><CardContent className="space-y-5">{connection ? <><div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last verified</p><p className="mt-1 text-sm font-medium">{connection.last_verified_at ? format(new Date(connection.last_verified_at), "MMM d, h:mm a") : "Pending"}</p></div><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Token health</p><p className="mt-1 text-sm font-medium">{connection.token_expires_at ? `Expires ${format(new Date(connection.token_expires_at), "MMM d, yyyy")}` : "Long-lived"}</p></div><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Destinations</p><p className="mt-1 text-sm font-medium">{accounts.filter((account) => account.is_selected).length} selected</p></div></div><div className="space-y-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><AccountPill account={account} /><div className="flex items-center gap-2"><Badge variant="outline" className={account.status === "active" ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{account.status.replace("_", " ")}</Badge>{canManage && <Switch aria-label={`Use ${account.display_name}`} checked={account.is_selected} disabled={account.status !== "active"} onCheckedChange={(selected) => onAccountSelection(account.id, selected)} />}</div></div>)}</div>{canManage && <div className="flex flex-wrap gap-2"><Button onClick={onSync} disabled={busy}><RefreshCw className={cn("mr-2 h-4 w-4", busy && "animate-spin")} />Sync accounts</Button><Button variant="outline" onClick={onConnect} disabled={busy}>Reconnect</Button><Button variant="ghost" className="text-destructive" onClick={onDisconnect} disabled={busy}><Trash2 className="mr-2 h-4 w-4" />Disconnect</Button></div>}</> : <div className="rounded-xl border border-dashed p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50"><Link2 className="h-5 w-5 text-blue-600" /></div><h3 className="mt-4 font-semibold">Connect your Meta business assets</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Discover managed Facebook Pages and linked professional Instagram accounts. Tokens remain encrypted and server-side.</p>{canManage && <Button className="mt-5" onClick={onConnect} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Connect Meta</Button>}</div>}</CardContent></Card><div className="space-y-6"><Card className="shadow-none"><CardHeader><CardTitle className="text-base">Workflow</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Require approval</p><p className="mt-1 text-xs text-muted-foreground">Drafts must be approved before scheduling.</p></div><Switch checked={approvalRequired} disabled={!canManage} onCheckedChange={onApprovalChange} /></div><div className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><Clock3 className="mb-2 h-4 w-4 text-foreground" />Workspace timezone: America/Chicago. All publishing timestamps are stored in UTC.</div></CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle className="text-base">Permissions requested</CardTitle></CardHeader><CardContent className="space-y-4">{META_PERMISSIONS.map((permission) => <div key={permission.scope} className="flex gap-3"><div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50"><Check className="h-3.5 w-3.5 text-emerald-600" /></div><div><p className="font-mono text-xs font-medium">{permission.scope}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{permission.reason}</p></div></div>)}<div className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mb-2 h-4 w-4 text-foreground" />Access tokens never enter the browser, URLs, analytics, or client-visible database records.</div></CardContent></Card></div></div>;
}

export default function SocialPublisher() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, isManagerOrAbove } = usePermissions();
  const data = useSocialPublisherData();
  const actions = useSocialAction();
  const [composerOpen, setComposerOpen] = useState(false);
  const [schedulePost, setSchedulePost] = useState<SocialPost | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const value = data.data;
  const posts = value?.posts || [];
  const timezone = value?.settings?.timezone || TIMEZONE;
  const filtered = posts.filter((post) => (statusFilter === "all" || post.workflow_status === statusFilter) && (channelFilter === "all" || post.social_post_variants.some((variant) => variant.platform === channelFilter)));
  const counts = {
    scheduled: posts.filter((post) => post.workflow_status === "scheduled").length,
    review: posts.filter((post) => post.workflow_status === "in_review").length,
    published: posts.filter((post) => post.workflow_status === "published").length,
    attention: posts.filter((post) => ["failed", "partially_published", "connection_required"].includes(post.workflow_status)).length,
  };

  useEffect(() => {
    const meta = searchParams.get("meta");
    if (!meta) return;
    toast({ variant: meta === "connected" ? "default" : "destructive", description: meta === "connected" ? "Meta connected and accounts synchronized." : meta === "expired" ? "The Meta authorization expired. Please try again." : "Meta could not be connected." });
    searchParams.delete("meta"); setSearchParams(searchParams, { replace: true }); data.refetch();
  }, [data, searchParams, setSearchParams, toast]);

  const run = async (promise: Promise<unknown>, success: string) => { try { await promise; toast({ description: success }); } catch (error) { toast({ variant: "destructive", description: error instanceof Error ? error.message : "The action failed." }); } };
  const setApprovalRequired = async (approvalRequired: boolean) => {
    if (!value?.settings?.org_id) return;
    await run((supabase as any).from("social_publisher_settings").upsert({ org_id: value.settings.org_id, timezone, approval_required: approvalRequired }).then(({ error }: any) => { if (error) throw error; return data.refetch(); }), approvalRequired ? "Approval is now required." : "Direct scheduling is now allowed.");
  };

  return <AppShell><div className="flex min-h-full flex-col bg-muted/20"><Header title="Social Publisher" subtitle="Plan once. Adapt each message. Publish with control." actions={<Button onClick={() => setComposerOpen(true)}><Plus className="mr-2 h-4 w-4" />Create post</Button>} /><main className="flex-1 space-y-6 p-4 sm:p-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Scheduled" value={counts.scheduled} detail="Queued across all channels" /><Metric label="Awaiting review" value={counts.review} detail="Ready for an approver" /><Metric label="Published" value={counts.published} detail="Completed publishing sets" tone="green" /><Metric label="Needs attention" value={counts.attention} detail="Failures or reconnects" tone={counts.attention ? "red" : "default"} /></div>
    <Tabs defaultValue="content" className="space-y-4"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="content">Content</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger><TabsTrigger value="operations">Operations</TabsTrigger><TabsTrigger value="connections">Connections</TabsTrigger></TabsList><div className="flex gap-2"><Select value={channelFilter} onValueChange={setChannelFilter}><SelectTrigger className="w-36 bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="instagram">Instagram</SelectItem></SelectContent></Select><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40 bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="in_review">In review</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent></Select></div></div>
      <TabsContent value="content"><div className="grid gap-4 xl:grid-cols-2">{data.isLoading ? <div className="col-span-full grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length ? filtered.map((post) => <PostCard key={post.id} post={post} canApprove={isManagerOrAbove} canSchedule={isManagerOrAbove && (!value?.settings?.approval_required || post.workflow_status === "approved")} onAction={(action) => run(actions.transition.mutateAsync({ postId: post.id, action }), action === "approve" ? "Post approved." : action === "submit" ? "Post submitted for review." : "Changes requested.")} onDuplicate={() => run(actions.duplicate.mutateAsync(post), "Draft duplicated.")} onSchedule={() => setSchedulePost(post)} onRetry={(jobId) => run(actions.retry.mutateAsync(jobId), "Failed channel processed again.")} />) : <div className="col-span-full rounded-2xl border border-dashed bg-background p-12 text-center"><Sparkles className="mx-auto h-9 w-9 text-muted-foreground/50" /><h3 className="mt-4 font-semibold">Your content calendar starts here</h3><p className="mt-2 text-sm text-muted-foreground">Create separate Facebook and Instagram versions under one post.</p><Button className="mt-5" onClick={() => setComposerOpen(true)}><Plus className="mr-2 h-4 w-4" />Create first post</Button></div>}</div></TabsContent>
      <TabsContent value="calendar"><EditorialCalendar posts={filtered} timezone={timezone} /></TabsContent>
      <TabsContent value="operations"><div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card className="shadow-none"><CardHeader><CardTitle className="text-base">Publishing jobs</CardTitle></CardHeader><CardContent className="space-y-2">{posts.flatMap((post) => post.social_post_variants.flatMap((variant) => (variant.social_publish_jobs || []).map((job) => ({ post, variant, job })))).sort((a, b) => b.job.id.localeCompare(a.job.id)).map(({ post, variant, job }) => <div key={job.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><PlatformIcon platform={variant.platform} className="h-5 w-5" /><div><p className="text-sm font-medium">{post.title}</p><p className="text-xs text-muted-foreground">Attempt {job.attempt_count} · <span className="capitalize">{job.status}</span></p></div></div>{job.status === "failed" && isManagerOrAbove && <Button size="sm" variant="outline" onClick={() => run(actions.retry.mutateAsync(job.id), "Channel retried.")}><RotateCcw className="mr-2 h-3.5 w-3.5" />Retry</Button>}</div>)}{!posts.some((post) => post.social_post_variants.some((variant) => variant.social_publish_jobs?.length)) && <p className="py-10 text-center text-sm text-muted-foreground">No publishing jobs yet.</p>}</CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader><CardContent className="space-y-4">{(value?.activity || []).map((event: any) => <div key={event.id} className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-medium capitalize">{String(event.action).replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{format(new Date(event.created_at), "MMM d, h:mm a")}</p></div></div>)}{!value?.activity?.length && <p className="text-sm text-muted-foreground">Activity appears here as your team works.</p>}</CardContent></Card></div></TabsContent>
      <TabsContent value="connections"><ConnectionsPanel accounts={value?.accounts || []} connection={value?.connection} canManage={isAdmin} approvalRequired={value?.settings?.approval_required || false} onApprovalChange={setApprovalRequired} onAccountSelection={(accountId, selected) => run(actions.selectAccount.mutateAsync({ accountId, selected }), selected ? "Destination enabled." : "Destination disabled.")} busy={actions.connect.isPending || actions.sync.isPending || actions.disconnect.isPending} onConnect={() => run(actions.connect.mutateAsync(), "Opening Meta authorization…")} onSync={() => run(actions.sync.mutateAsync(), "Meta accounts synchronized.")} onDisconnect={() => run(actions.disconnect.mutateAsync(), "Meta disconnected.")} /></TabsContent>
    </Tabs>
  </main></div><ComposerDialog open={composerOpen} onOpenChange={setComposerOpen} accounts={(value?.accounts || []).filter((account) => account.is_selected)} timezone={timezone} approvalRequired={value?.settings?.approval_required || false} canSchedule={isManagerOrAbove} /><ScheduleDialog post={schedulePost} open={Boolean(schedulePost)} onOpenChange={(open) => !open && setSchedulePost(null)} pending={actions.schedule.isPending} onSchedule={(scheduledLocal) => schedulePost && run(actions.schedule.mutateAsync({ postId: schedulePost.id, scheduledLocal, timezone: schedulePost.scheduled_timezone }), "Post scheduled.").then(() => setSchedulePost(null))} /></AppShell>;
}
