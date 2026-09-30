import { Fragment, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Copy, Check, FolderDown, Plus, ChevronDown, ChevronUp,
  Download, X, Loader2, Share2, FileIcon, Trash2, LinkIcon,
  UploadCloud, CalendarClock, RefreshCw, MessageSquare,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useFileRequests,
  useFileSubmissions,
  useFileRequestUsage,
  useCreateFileRequest,
  useCloseFileRequest,
  useDeleteFileRequest,
  useSetLogoRequest,
  type FileRequest,
  type FileRequestUsage,
  type FileSubmission,
} from "@/hooks/useFileRequests";
import {
  useFileShares,
  useCreateFileShare,
  useUpdateFileShareExpiry,
  useRegenerateFileShareToken,
  useDeleteFileShare,
  type FileShare,
} from "@/hooks/useFileShares";
import { groupByNote } from "@/lib/fileRequests/submissions";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors shrink-0"
      title="Copy link"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

// ── Submissions table ─────────────────────────────────────────────────────────
function SubmissionsPanel({ requestId }: { requestId: string }) {
  const { data: submissions = [], isLoading } = useFileSubmissions(requestId);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const handleDownload = async (submission: FileSubmission) => {
    setDownloading(prev => ({ ...prev, [submission.id]: true }));
    try {
      // The link carries the file name and tells the browser to save it, so the
      // download streams to disk. Fetching it into the page first held a whole
      // video in memory before the save could even start.
      const { data, error } = await supabase.storage
        .from("client-uploads")
        .createSignedUrl(submission.file_path, 3600, { download: submission.file_name });
      if (error) throw error;
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast({ variant: "destructive", description: "Failed to download file." });
    } finally {
      setDownloading(prev => ({ ...prev, [submission.id]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="pt-3 space-y-2">
        {[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="pt-3 text-center py-6 text-sm text-muted-foreground">
        No files received yet.
      </div>
    );
  }

  // The upload page no longer asks clients for a name and email, so only older
  // submissions carry them. The columns show only where there is something in them.
  const showSender = submissions.some((s) => s.uploader_name || s.uploader_email);
  const columnCount = showSender ? 6 : 4;

  return (
    // The container's width is what a client note wraps to (100cqw below), so
    // a note stays readable when the table is wider than the card and scrolls.
    <div className="pt-3 overflow-x-auto [container-type:inline-size]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {showSender && <th className="text-left pb-2 font-medium">Name</th>}
            {showSender && <th className="text-left pb-2 font-medium">Email</th>}
            <th className="text-left pb-2 font-medium">File</th>
            <th className="text-left pb-2 font-medium">Size</th>
            <th className="text-left pb-2 font-medium">Date</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {/* A client's note shows once, above the files it was sent with. */}
          {groupByNote(submissions).map((group) => (
            <Fragment key={group.rows[0].id}>
              {group.note && (
                <tr>
                  <td colSpan={columnCount} className="px-0 pt-3 pb-1.5">
                    <div className="sticky left-0 flex w-[100cqw] items-start gap-2 rounded-md bg-muted/60 px-2.5 py-2">
                      <MessageSquare size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Client note{group.rows.length > 1 ? ` · ${group.rows.length} files` : ""}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-foreground [overflow-wrap:anywhere]">{group.note}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {group.rows.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  {showSender && <td className="py-2 pr-3 font-medium">{s.uploader_name || "—"}</td>}
                  {showSender && <td className="py-2 pr-3 text-muted-foreground">{s.uploader_email || "—"}</td>}
                  <td className="py-2 pr-3 max-w-[180px] truncate" title={s.file_name}>{s.file_name}</td>
                  <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{formatBytes(s.file_size)}</td>
                  <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                    {format(new Date(s.created_at), "MMM d, yyyy")}
                  </td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant={downloading[s.id] ? "secondary" : "outline"}
                      className="h-6 text-[10px] gap-1"
                      onClick={() => handleDownload(s)}
                      disabled={downloading[s.id]}
                    >
                      {downloading[s.id]
                        ? <><Loader2 size={10} className="animate-spin" /> Downloading…</>
                        : <><Download size={10} /> Download</>}
                    </Button>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Request card ──────────────────────────────────────────────────────────────
function RequestCard({
  request,
  usage,
  onClose,
  onDelete,
}: {
  request: FileRequest;
  usage?: FileRequestUsage;
  onClose: (r: FileRequest) => void;
  onDelete: (r: FileRequest) => void;
}) {
  const [filesOpen, setFilesOpen] = useState(false);
  const setLogoRequest = useSetLogoRequest();
  const shareUrl = `${window.location.origin}/upload/${request.token}`;
  const isActive = request.status === "active";
  const logoSwitchId = `logo-${request.id}`;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-medium",
                isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              )}
            >
              {isActive ? "Active" : "Closed"}
            </Badge>
            {request.expires_at && (
              <span className="text-[10px] text-muted-foreground">
                Expires {format(new Date(request.expires_at), "MMM d, yyyy")}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold">{request.title}</h3>
          {request.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{request.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onClose(request)}
            >
              <X size={11} className="mr-1" /> Close Link
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 gap-1"
            onClick={() => onDelete(request)}
          >
            <Trash2 size={11} /> Delete
          </Button>
        </div>
      </div>

      {/* Shareable link */}
      <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-2">
        <code className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{shareUrl}</code>
        <CopyButton text={shareUrl} />
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilesOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            {filesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            View Files
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {usage?.files
              ? `${usage.files} file${usage.files === 1 ? "" : "s"} · ${formatBytes(usage.bytes)}`
              : "No files yet"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Only a logo request shows the client the logo file guidelines. */}
          <label htmlFor={logoSwitchId} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch
              id={logoSwitchId}
              checked={request.is_logo_request}
              onCheckedChange={(value) => setLogoRequest.mutate({ id: request.id, value })}
            />
            Logo guidelines
          </label>
          <span className="text-xs text-muted-foreground">
            Created {format(new Date(request.created_at), "MMM d, yyyy")}
          </span>
        </div>
      </div>

      {/* Submissions panel */}
      {filesOpen && <SubmissionsPanel requestId={request.id} />}
    </div>
  );
}

// ── New Drop Dialog ───────────────────────────────────────────────────────────
function NewDropDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const createRequest = useCreateFileRequest();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  // Follows the title ("Acme – Logos") until someone sets it by hand.
  const [logoChoice, setLogoChoice] = useState<boolean | null>(null);
  const isLogoRequest = logoChoice ?? /logo/i.test(title);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createRequest.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        expires_at: expiresAt || null,
        is_logo_request: isLogoRequest,
      });
      toast({ description: "Drop link created." });
      setTitle("");
      setDescription("");
      setExpiresAt("");
      setLogoChoice(null);
      onOpenChange(false);
    } catch {
      toast({ variant: "destructive", description: "Failed to create drop link." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Drop Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
            <Input
              placeholder="e.g. Brand Assets for Acme Corp"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description <span className="text-muted-foreground text-xs">(optional)</span></label>
            <Textarea
              placeholder="Tell the client what files to upload…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiry date <span className="text-muted-foreground text-xs">(optional)</span></label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <label htmlFor="new-drop-logo" className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
            <Switch
              id="new-drop-logo"
              checked={isLogoRequest}
              onCheckedChange={setLogoChoice}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">Logo request</span>
              <span className="block text-xs text-muted-foreground">
                Shows the client which logo files to send: .AI, .EPS or .PDF, or a high-res PNG or JPG.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || createRequest.isPending}>
              {createRequest.isPending ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Creating…</> : "Create Link"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Share card ────────────────────────────────────────────────────────────────
function ShareCard({
  share,
  onDelete,
  onEditExpiry,
  onRegenerate,
}: {
  share: FileShare;
  onDelete: (s: FileShare) => void;
  onEditExpiry: (s: FileShare) => void;
  onRegenerate: (s: FileShare) => void;
}) {
  const downloadUrl = `${window.location.origin}/download/${share.token}`;
  const isExpired = share.expires_at ? new Date(share.expires_at) < new Date() : false;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
            <FileIcon size={16} className="text-rose-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{share.label}</p>
            <p className="text-xs text-muted-foreground">
              {share.files.length > 1
                ? `${share.files.length} files · ${formatBytes(share.file_size)}`
                : `${share.file_name} · ${formatBytes(share.file_size)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isExpired && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">
              Expired
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => onEditExpiry(share)}
          >
            <CalendarClock size={11} /> {share.expires_at ? "Edit Expiry" : "Set Expiry"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => onRegenerate(share)}
          >
            <RefreshCw size={11} /> Regenerate Link
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 gap-1"
            onClick={() => onDelete(share)}
          >
            <Trash2 size={11} /> Delete
          </Button>
        </div>
      </div>

      {/* Download link */}
      <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-2">
        <LinkIcon size={11} className="text-muted-foreground shrink-0" />
        <code className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{downloadUrl}</code>
        <CopyButton text={downloadUrl} />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{share.download_count} download{share.download_count !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-3">
          {share.expires_at && (
            <span>
              Expires {format(new Date(share.expires_at), "MMM d, yyyy")}
            </span>
          )}
          <span>Created {format(new Date(share.created_at), "MMM d, yyyy")}</span>
        </div>
      </div>
    </div>
  );
}

// ── Upload Share Dialog ───────────────────────────────────────────────────────
const MAX_SHARE_BYTES = 50 * 1024 * 1024; // 50 MB per file (Supabase plan limit)

function NewShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const createShare = useCreateFileShare();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [label, setLabel]       = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [files, setFiles]       = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const reset = () => { setLabel(""); setExpiresAt(""); setFiles([]); };

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const oversized = arr.filter(f => f.size > MAX_SHARE_BYTES);
    if (oversized.length) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `${oversized.map(f => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the 50 MB limit.`,
      });
    }
    const valid = arr.filter(f => f.size <= MAX_SHARE_BYTES);
    if (!valid.length) return;
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      const merged = [...prev, ...valid.filter(f => !names.has(f.name))];
      if (!label.trim() && merged.length === 1) setLabel(merged[0].name);
      return merged;
    });
  };

  const removeFile = (name: string) =>
    setFiles(prev => prev.filter(f => f.name !== name));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length || !label.trim()) return;
    try {
      await createShare.mutateAsync({ label, files, expiresAt: expiresAt || null });
      toast({ description: "Share link created." });
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Upload failed", description: msg || "Failed to create share link." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Files</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">

          {/* Drop zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-3 cursor-pointer transition-colors",
              dragging ? "border-rose-400 bg-rose-50" : "border-border hover:border-rose-300 hover:bg-rose-50/40"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <UploadCloud size={26} className="text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Drop files here</p>
              <p className="text-xs text-muted-foreground">or click to browse · max 50 MB per file</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
          />

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map(f => (
                <div key={f.name} className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2">
                  <FileIcon size={13} className="text-rose-500 shrink-0" />
                  <span className="text-xs flex-1 min-w-0 truncate" title={f.name}>{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.name)}
                    className="ml-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {files.length > 1 && (
                <p className="text-xs text-muted-foreground text-right">
                  {files.length} files · {formatBytes(totalSize)} total
                </p>
              )}
            </div>
          )}

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Label <span className="text-destructive">*</span></label>
            <Input
              placeholder="e.g. Q2 Proposal Deck"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiry date <span className="text-muted-foreground text-xs">(optional)</span></label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
            <Button type="submit" disabled={!files.length || !label.trim() || createShare.isPending}>
              {createShare.isPending
                ? <><Loader2 size={14} className="animate-spin mr-1.5" />Uploading…</>
                : "Create Link"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Expiry Dialog ────────────────────────────────────────────────────────
function EditExpiryDialog({
  share,
  onOpenChange,
}: {
  share: FileShare | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const updateExpiry = useUpdateFileShareExpiry();
  const [expiresAt, setExpiresAt] = useState("");

  // Sync local state whenever the target share changes
  if (share && expiresAt === "" && share.expires_at) {
    setExpiresAt(share.expires_at.slice(0, 10));
  }

  const handleClose = (v: boolean) => {
    if (!v) setExpiresAt("");
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (!share) return;
    try {
      await updateExpiry.mutateAsync({ id: share.id, expiresAt: expiresAt || null });
      toast({ description: "Expiration date updated." });
      handleClose(false);
    } catch {
      toast({ variant: "destructive", description: "Failed to update expiration date." });
    }
  };

  return (
    <Dialog open={!!share} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Expiration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Update or remove the expiration date for "{share?.label}".
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiry date</label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setExpiresAt("")}
              disabled={!expiresAt}
            >
              Remove expiration
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={updateExpiry.isPending}>
                {updateExpiry.isPending ? <><Loader2 size={14} className="animate-spin mr-1.5" />Saving…</> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FileDrop() {
  const { data: requests = [], isLoading: requestsLoading } = useFileRequests();
  const { data: shares = [], isLoading: sharesLoading } = useFileShares();
  const { data: usage = {} } = useFileRequestUsage();
  const closeRequest = useCloseFileRequest();
  const deleteRequest = useDeleteFileRequest();
  const deleteShare = useDeleteFileShare();
  const regenerateToken = useRegenerateFileShareToken();
  const { toast } = useToast();

  const [tab, setTab] = useState<"receive" | "send">("receive");
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FileRequest | null>(null);
  const [deleteRequestTarget, setDeleteRequestTarget] = useState<FileRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileShare | null>(null);

  // What every link's files take up together, so the team can see when it is time to clear some out.
  const received = requests.reduce(
    (total, r) => ({ files: total.files + (usage[r.id]?.files ?? 0), bytes: total.bytes + (usage[r.id]?.bytes ?? 0) }),
    { files: 0, bytes: 0 },
  );
  // The dialog keeps showing the link it was opened for while it fades out;
  // without this its text would switch to the "no files" wording mid-close.
  const shownDeleteRequest = useRef<{ request: FileRequest; usage?: FileRequestUsage } | null>(null);
  if (deleteRequestTarget) {
    shownDeleteRequest.current = { request: deleteRequestTarget, usage: usage[deleteRequestTarget.id] };
  }
  const deleteRequestUsage = shownDeleteRequest.current?.usage;
  const deleteRequestTitle = shownDeleteRequest.current?.request.title;
  const [editExpiryTarget, setEditExpiryTarget] = useState<FileShare | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<FileShare | null>(null);

  const handleConfirmClose = async () => {
    if (!closeTarget) return;
    try {
      await closeRequest.mutateAsync(closeTarget.id);
      toast({ description: `"${closeTarget.title}" link closed.` });
    } catch {
      toast({ variant: "destructive", description: "Failed to close link." });
    }
    setCloseTarget(null);
  };

  const handleConfirmDeleteRequest = async (e: React.MouseEvent) => {
    // Stays open while the files are removed; a link with many files takes a moment.
    e.preventDefault();
    if (!deleteRequestTarget) return;
    try {
      await deleteRequest.mutateAsync(deleteRequestTarget);
      toast({ description: `"${deleteRequestTarget.title}" and its files deleted.` });
      setDeleteRequestTarget(null);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to delete link." });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShare.mutateAsync(deleteTarget);
      toast({ description: `"${deleteTarget.label}" deleted.` });
    } catch {
      toast({ variant: "destructive", description: "Failed to delete share." });
    }
    setDeleteTarget(null);
  };

  const handleConfirmRegenerate = async () => {
    if (!regenerateTarget) return;
    try {
      await regenerateToken.mutateAsync({ id: regenerateTarget.id });
      toast({ description: `New link generated for "${regenerateTarget.label}".` });
    } catch {
      toast({ variant: "destructive", description: "Failed to regenerate link." });
    }
    setRegenerateTarget(null);
  };

  return (
    <AppShell>
      <Header title="Files" subtitle="Receive files from clients or share files with them." />
      <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">

        {/* Tab + action row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "receive" | "send")}>
            <TabsList>
              <TabsTrigger value="receive" className="gap-1.5">
                <FolderDown size={13} /> Receive
              </TabsTrigger>
              <TabsTrigger value="send" className="gap-1.5">
                <Share2 size={13} /> Send / Share
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "receive" ? (
            <Button onClick={() => setDropDialogOpen(true)} className="gap-2">
              <Plus size={15} /> New Drop Link
            </Button>
          ) : (
            <Button onClick={() => setShareDialogOpen(true)} className="gap-2">
              <Plus size={15} /> Share a File
            </Button>
          )}
        </div>

        {/* ── RECEIVE tab ─────────────────────────────────────── */}
        {tab === "receive" && (
          requestsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FolderDown size={32} className="text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold">No drop links yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Create a shareable link and send it to a client — they can drag &amp; drop files without needing an account.
                </p>
              </div>
              <Button onClick={() => setDropDialogOpen(true)} className="gap-2">
                <Plus size={15} /> Create Drop Link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {received.files > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Client uploads: {received.files} file{received.files === 1 ? "" : "s"} · {formatBytes(received.bytes)}.
                  Deleting a link removes its files from storage.
                </p>
              )}
              {requests.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  usage={usage[r.id]}
                  onClose={setCloseTarget}
                  onDelete={setDeleteRequestTarget}
                />
              ))}
            </div>
          )
        )}

        {/* ── SEND tab ────────────────────────────────────────── */}
        {tab === "send" && (
          sharesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : shares.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center">
                <Share2 size={32} className="text-rose-500" />
              </div>
              <div>
                <p className="text-base font-semibold">No shared files yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Upload a PDF, deck, or any file and get a shareable download link to send to clients.
                </p>
              </div>
              <Button onClick={() => setShareDialogOpen(true)} className="gap-2">
                <Plus size={15} /> Share a File
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {shares.map((s) => (
                <ShareCard key={s.id} share={s} onDelete={setDeleteTarget} onEditExpiry={setEditExpiryTarget} onRegenerate={setRegenerateTarget} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Dialogs */}
      <NewDropDialog open={dropDialogOpen} onOpenChange={setDropDialogOpen} />
      <NewShareDialog open={shareDialogOpen} onOpenChange={setShareDialogOpen} />
      <EditExpiryDialog share={editExpiryTarget} onOpenChange={(v) => !v && setEditExpiryTarget(null)} />

      {/* Close drop confirm */}
      <AlertDialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this link?</AlertDialogTitle>
            <AlertDialogDescription>
              "{closeTarget?.title}" will be closed. Clients will no longer be able to upload files using this link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Close Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete drop link confirm */}
      <AlertDialog
        open={!!deleteRequestTarget}
        onOpenChange={(open) => !open && !deleteRequest.isPending && setDeleteRequestTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link and its files?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRequestUsage?.files
                ? `"${deleteRequestTitle}" and the ${deleteRequestUsage.files} file${deleteRequestUsage.files === 1 ? "" : "s"} clients sent through it (${formatBytes(deleteRequestUsage.bytes)}) will be permanently deleted. Download anything you want to keep first.`
                : `"${deleteRequestTitle}" will be permanently deleted. No files were received through it.`}{" "}
              The link stops working. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRequest.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteRequest}
              disabled={deleteRequest.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRequest.isPending
                ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Deleting…</>
                : deleteRequestUsage?.files ? "Delete link and files" : "Delete link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate link confirm */}
      <AlertDialog open={!!regenerateTarget} onOpenChange={(open) => !open && setRegenerateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate this link?</AlertDialogTitle>
            <AlertDialogDescription>
              A new download link will be generated for "{regenerateTarget?.label}". The old link will stop working immediately, and the download count will reset to 0.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRegenerate}>
              Regenerate Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete share confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this share?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.label}" will be permanently deleted and the download link will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
