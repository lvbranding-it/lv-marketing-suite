import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { usePhotoComments, useSignedUrl, useAddComment } from "@/hooks/usePhotoSessions";
import type { SessionPhoto } from "@/integrations/supabase/types";

interface PhotoCommentPanelProps {
  photo: SessionPhoto | null;
  sessionId: string;
  orgId: string;
  authorLabel: string;
  authorUserId: string | null;
  onClose: () => void;
}

function PhotoDisplay({ storagePath }: { storagePath: string }) {
  const { data: signedUrl, isLoading } = useSignedUrl(storagePath);

  if (isLoading) return <Skeleton className="w-full aspect-square rounded-lg" />;
  if (!signedUrl) return <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">Image unavailable</div>;

  return (
    <img
      src={signedUrl}
      alt="Photo"
      className="w-full rounded-lg object-contain max-h-72 bg-muted"
    />
  );
}

export default function PhotoCommentPanel({
  photo,
  sessionId,
  orgId,
  authorLabel,
  authorUserId,
  onClose,
}: PhotoCommentPanelProps) {
  const [body, setBody] = useState("");
  const { data: comments = [], isLoading: commentsLoading } = usePhotoComments(photo?.id);
  const addComment = useAddComment();

  const handleSend = async () => {
    if (!photo || !body.trim()) return;
    await addComment.mutateAsync({
      photoId: photo.id,
      sessionId,
      orgId,
      body: body.trim(),
      authorLabel,
      authorUserId,
    });
    setBody("");
  };

  return (
    <Sheet open={!!photo} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="text-base truncate">{photo?.file_name ?? "Photo"}</SheetTitle>
        </SheetHeader>

        <div className="p-4 pt-3">
          {photo && <PhotoDisplay storagePath={photo.storage_path} />}
        </div>

        <div className="px-4 pb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Comments ({comments.length})
        </div>

        <ScrollArea className="flex-1 px-4">
          {commentsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No comments yet.</p>
          ) : (
            <div className="space-y-3 pb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-foreground">{comment.author_label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{comment.body}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 pt-2 border-t flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            className="resize-none text-sm min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!body.trim() || addComment.isPending}
            className="shrink-0 self-end"
          >
            {addComment.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
