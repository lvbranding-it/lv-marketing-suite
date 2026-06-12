import { useRef, useState } from "react";
import { format } from "date-fns";
import {
  Copy, Check, FolderDown, Plus, ChevronDown, ChevronUp,
  Download, X, Loader2, Share2, FileIcon, Trash2, LinkIcon,
  UploadCloud, CalendarClock, RefreshCw,
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
  useCreateFileRequest,
  useCloseFileRequest,
  type FileRequest,
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

  const handleDownload = async (submission: FileSubmission) => {
    try {
      const { data, error } = await supabase.storage
        .from("client-uploads")
        .createSignedUrl(submission.file_path, 3600);
      if (error) throw error;
      const res = await fetch(data.signedUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = submission.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", description: "Failed to download file." });
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

  return (
    <div className="pt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left pb-2 font-medium">Name</th>
            <th className="text-left pb-2 font-medium">Email</th>
            <th className="text-left pb-2 font-medium">File</th>
            <th className="text-left pb-2 font-medium">Size</th>
            <th className="text-left pb-2 font-medium">Date</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {submissions.map((s) => (
            <tr key={s.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2 pr-3 font-medium">{s.uploader_name}</td>
              <td className="py-2 pr-3 text-muted-foreground">{s.uploader_email}</td>
              <td className="py-2 pr-3 max-w-[180px] truncate" title={s.file_name}>{s.file_name}</td>
              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{formatBytes(s.file_size)}</td>
              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                {format(new Date(s.created_at), "MMM d, yyyy")}
              </td>
              <td className="py-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => handleDownload(s)}
                >
                  <Download size={10} /> Download
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Request card ──────────────────────────────────────────────────────────────
function RequestCard({
  request,
  onClose,
}: {
  request: FileRequest;
  onClose: (r: FileRequest) => void;
}) {
  const [filesOpen, setFilesOpen] = useState(false);
  const shareUrl = `${window.location.origin}/upload/${request.token}`;
  const isActive = request.status === "active";

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
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-muted-foreground shrink-0"
            onClick={() => onClose(request)}
          >
            <X size={11} className="mr-1" /> Close Link
          </Button>
        )}
      </div>

      {/* Shareable link */}
      <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-2">
        <code className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{shareUrl}</code>
        <CopyButton text={shareUrl} />
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setFilesOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
        >
          {filesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          View Files
        </button>
        <span className="text-xs text-muted-foreground">
          Created {format(new Date(request.created_at), "MMM d, yyyy")}
        </span>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createRequest.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        expires_at: expiresAt || null,
      });
      toast({ description: "Drop link created." });
      setTitle("");
      setDescription("");
      setExpiresAt("");
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
  const closeRequest = useCloseFileRequest();
  const deleteShare = useDeleteFileShare();
  const regenerateToken = useRegenerateFileShareToken();
  const { toast } = useToast();

  const [tab, setTab] = useState<"receive" | "send">("receive");
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FileRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileShare | null>(null);
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
              {requests.map((r) => (
                <RequestCard key={r.id} request={r} onClose={setCloseTarget} />
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
