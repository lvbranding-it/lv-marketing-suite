import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  usePhotoComments,
  useSignedUrl,
  useAddComment,
  useClientSessionComments,
  useAddClientComment,
  type ClientPhoto,
} from "@/hooks/usePhotoSessions";
import type { SessionPhoto } from "@/integrations/supabase/types";

/**
 * The comment thread on one photo, for the team or for the client.
 *
 * The team reads and writes through its own access. The client has no login:
 * it goes through the share link, and its picture is the link the page already
 * holds — a client cannot sign storage paths itself, so the panel used to show
 * "Image unavailable" to every client who opened it.
 */
type PhotoCommentPanelProps =
  | {
      photo: SessionPhoto | null;
      sessionId: string;
      orgId: string;
      authorLabel: string;
      authorUserId: string | null;
      shareToken?: undefined;
      imageUrl?: undefined;
      onClose: () => void;
    }
  | {
      photo: ClientPhoto | null;
      shareToken: string | undefined;
      imageUrl: string | null;
      onClose: () => void;
    };

function TeamPhotoDisplay({ storagePath }: { storagePath: string }) {
  const { data: signedUrl, isLoading } = useSignedUrl(storagePath, { width: 1200 });
  return <PhotoImage url={signedUrl ?? null} loading={isLoading} />;
}

function PhotoImage({ url, loading }: { url: string | null; loading?: boolean }) {
  if (loading) return <Skeleton className="w-full aspect-square rounded-lg" />;
  if (!url) return <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">Image unavailable</div>;
  return <img src={url} alt="Photo" className="w-full rounded-lg object-contain max-h-72 bg-muted" />;
}

export default function PhotoCommentPanel(props: PhotoCommentPanelProps) {
  const { photo, onClose } = props;
  const isClient = "shareToken" in props && props.shareToken !== undefined;
  const [body, setBody] = useState("");

  // Both readers are mounted; only the one for this mode is enabled.
  const team = usePhotoComments(!isClient ? photo?.id : undefined);
  const client = useClientSessionComments(isClient ? props.shareToken : undefined);
  const addTeamComment = useAddComment();
  const addClientComment = useAddClientComment(isClient ? props.shareToken : undefined);

  const comments = isClient ? (client.data ?? []).filter((comment) => comment.photo_id === photo?.id) : team.data ?? [];
  const commentsLoading = isClient ? client.isLoading : team.isLoading;
  const sending = addTeamComment.isPending || addClientComment.isPending;

  const handleSend = async () => {
    if (!photo || !body.trim()) return;
    try {
      if (isClient) {
        await addClientComment.mutateAsync({ photoId: photo.id, body: body.trim() });
      } else {
        const teamProps = props as Extract<PhotoCommentPanelProps, { sessionId: string }>;
        await addTeamComment.mutateAsync({
          photoId: photo.id,
          sessionId: teamProps.sessionId,
          orgId: teamProps.orgId,
          body: body.trim(),
          authorLabel: teamProps.authorLabel,
          authorUserId: teamProps.authorUserId,
        });
      }
      setBody("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Comment was not sent",
        description: error instanceof Error ? error.message : "Check your connection and try again.",
      });
    }
  };

  return (
    <Sheet open={!!photo} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="text-base truncate">{photo?.file_name ?? "Photo"}</SheetTitle>
        </SheetHeader>

        <div className="p-4 pt-3">
          {photo && (isClient
            ? <PhotoImage url={props.imageUrl ?? null} />
            : <TeamPhotoDisplay storagePath={(photo as SessionPhoto).storage_path} />)}
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
            maxLength={2000}
            className="resize-none min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!body.trim() || sending}
            aria-label="Send comment"
            className="shrink-0 self-end"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
