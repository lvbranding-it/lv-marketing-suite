import { useState } from "react";
import { format } from "date-fns";
import { Copy, Check, FolderDown, Plus, ChevronDown, ChevronUp, Download, X, Loader2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
      window.open(data.signedUrl, "_blank");
    } catch {
      toast({ variant: "destructive", description: "Failed to generate download link." });
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FileDrop() {
  const { data: requests = [], isLoading } = useFileRequests();
  const closeRequest = useCloseFileRequest();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FileRequest | null>(null);

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

  return (
    <AppShell>
      <Header title="Client File Drop" subtitle="Send a link to clients so they can upload files directly to you." />
      <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header actions */}
        <div className="flex items-center justify-end">
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus size={15} /> New Drop Link
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
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
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus size={15} /> Create Drop Link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} onClose={setCloseTarget} />
            ))}
          </div>
        )}
      </div>

      {/* New drop dialog */}
      <NewDropDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* Close confirm */}
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
    </AppShell>
  );
}
