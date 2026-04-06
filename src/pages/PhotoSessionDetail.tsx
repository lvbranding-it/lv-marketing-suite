import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ChevronRight, Settings2, Camera, CheckCircle2,
  Send, Loader2,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import SessionStatsBar from "@/components/photo-sessions/SessionStatsBar";
import ShareLinkButton from "@/components/photo-sessions/ShareLinkButton";
import PhotoUploadZone from "@/components/photo-sessions/PhotoUploadZone";
import SessionPhotoGrid from "@/components/photo-sessions/SessionPhotoGrid";
import PhotoCommentPanel from "@/components/photo-sessions/PhotoCommentPanel";
import EditSessionDialog from "@/components/photo-sessions/EditSessionDialog";
import SessionInvoicePanel from "@/components/photo-sessions/SessionInvoicePanel";
import TopupInvoicePanel from "@/components/photo-sessions/TopupInvoicePanel";
import DeliverableUploadZone from "@/components/photo-sessions/DeliverableUploadZone";
import DeliverableGrid from "@/components/photo-sessions/DeliverableGrid";
import {
  usePhotoSession,
  useSessionPhotos,
  useSessionDeliverables,
  usePublishDeliverables,
} from "@/hooks/usePhotoSessions";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import type { SessionPhoto } from "@/integrations/supabase/types";

export default function PhotoSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { org } = useOrg();

  const { data: session, isLoading: sessionLoading } = usePhotoSession(sessionId);
  const { data: photos = [], isLoading: photosLoading } = useSessionPhotos(sessionId);
  const { data: deliverables = [] } = useSessionDeliverables(sessionId);
  const publishDeliverables = usePublishDeliverables();

  const [activeTab, setActiveTab] = useState("photos");
  const [selectedPhoto, setSelectedPhoto] = useState<SessionPhoto | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const filteredPhotos =
    activeTab === "selected"
      ? photos.filter((p) => p.status === "selected")
      : activeTab === "ready"
      ? photos.filter((p) => p.status === "ready" || p.status === "ready_for_download")
      : photos;

  const handlePublish = async () => {
    if (!sessionId) return;
    try {
      const result = await publishDeliverables.mutateAsync(sessionId);
      toast({
        description: result.notified
          ? "Photos published and client notified by email."
          : "Photos marked as ready. (No client email configured.)",
      });
    } catch {
      toast({ description: "Failed to publish deliverables.", variant: "destructive" });
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <AppShell>
        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="aspect-square w-full" />)}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell>
        <div className="p-3 sm:p-6 max-w-5xl mx-auto flex flex-col items-center justify-center py-24 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-muted-foreground mb-4">Session not found.</p>
          <Button onClick={() => navigate("/photo-sessions")}>Back to Sessions</Button>
        </div>
      </AppShell>
    );
  }

  const isPublished = !!session.deliverables_ready_at;
  const hasDeliverables = deliverables.length > 0;

  return (
    <AppShell>
      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-5">

        {/* ── Breadcrumb + actions ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <Link to="/photo-sessions" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Camera size={14} />
              Photo Sessions
            </Link>
            <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground truncate">{session.name}</span>
            <Badge
              variant="outline"
              className={`ml-1 shrink-0 ${
                session.status === "active"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {session.status === "active" ? "Active" : "Archived"}
            </Badge>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ShareLinkButton shareToken={session.share_token} />
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Settings2 size={14} className="mr-1.5" />
              Settings
            </Button>
          </div>
        </div>

        {/* ── Client info ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span><strong className="text-foreground">Client:</strong> {session.client_name}</span>
          {session.client_email && <span>{session.client_email}</span>}
          {(session.cc_emails ?? []).length > 0 && (
            <span className="text-xs">CC: {session.cc_emails.join(", ")}</span>
          )}
          {session.photo_limit > 0 && (
            <span><strong className="text-foreground">Limit:</strong> {session.photo_limit} photos</span>
          )}
          {Number(session.extra_photo_price) > 0 && (
            <span><strong className="text-foreground">Extra:</strong> ${Number(session.extra_photo_price).toFixed(2)}/photo</span>
          )}
        </div>

        {/* ── Client confirmed banner ── */}
        {session.finalized_at && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3 text-sm">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-green-800">Client confirmed selection</span>
              <span className="text-green-700 ml-2 text-xs">
                {new Date(session.finalized_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        )}

        {/* ── Stats ── */}
        <SessionStatsBar photos={photos} />

        {/* ── Invoice panels ── */}
        <SessionInvoicePanel session={session} />
        <TopupInvoicePanel session={session} photos={photos} />

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="photos">
              All Photos ({photos.length})
            </TabsTrigger>
            <TabsTrigger value="selected">
              Selected ({photos.filter(p => p.status === "selected").length})
            </TabsTrigger>
            <TabsTrigger value="ready">
              Ready ({photos.filter(p => p.status === "ready" || p.status === "ready_for_download").length})
            </TabsTrigger>
            <TabsTrigger value="deliverables">
              Deliverables {deliverables.length > 0 && `(${deliverables.length})`}
            </TabsTrigger>
          </TabsList>

          {/* ── Photos tabs ── */}
          {["photos", "selected", "ready"].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
              {tab === "photos" && org && (
                <PhotoUploadZone sessionId={session.id} orgId={org.id} />
              )}
              {photosLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-square w-full" />)}
                </div>
              ) : (
                <SessionPhotoGrid
                  photos={filteredPhotos}
                  onPhotoClick={setSelectedPhoto}
                />
              )}
            </TabsContent>
          ))}

          {/* ── Deliverables tab ── */}
          <TabsContent value="deliverables" className="mt-4 space-y-5">
            {/* Publish / notify banner */}
            {isPublished ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3 text-sm">
                <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                <div>
                  <span className="font-semibold text-green-800">Published</span>
                  <span className="text-green-700 ml-2 text-xs">
                    Client notified on{" "}
                    {new Date(session.deliverables_notified_at ?? session.deliverables_ready_at!).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ) : hasDeliverables ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold text-amber-800">Ready to publish?</p>
                  <p className="text-xs text-amber-700">
                    {deliverables.length} file{deliverables.length !== 1 ? "s" : ""} uploaded.
                    Publishing will enable the client download link and send them a notification email.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0"
                  disabled={publishDeliverables.isPending}
                  onClick={handlePublish}
                >
                  {publishDeliverables.isPending
                    ? <><Loader2 size={13} className="animate-spin" /> Publishing…</>
                    : <><Send size={13} /> Publish &amp; Notify Client</>
                  }
                </Button>
              </div>
            ) : null}

            {/* Upload zones side by side */}
            {org && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HD Files</p>
                  <DeliverableUploadZone sessionId={session.id} orgId={org.id} quality="hd" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Low-res (LR) Files</p>
                  <DeliverableUploadZone sessionId={session.id} orgId={org.id} quality="lr" />
                </div>
              </div>
            )}

            {/* File list */}
            <DeliverableGrid deliverables={deliverables} sessionId={session.id} />

            {!hasDeliverables && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-3xl mb-2">🗂️</p>
                <p className="text-sm text-muted-foreground">
                  No edited files uploaded yet. Upload HD and LR versions above, then publish to notify the client.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Comment panel */}
      {org && user && (
        <PhotoCommentPanel
          photo={selectedPhoto}
          sessionId={session.id}
          orgId={org.id}
          authorLabel="Photographer"
          authorUserId={user.id}
          onClose={() => setSelectedPhoto(null)}
        />
      )}

      {/* Edit dialog */}
      <EditSessionDialog
        session={session}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </AppShell>
  );
}
