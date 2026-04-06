import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Receipt, ExternalLink, Download, Archive } from "lucide-react";
import JSZip from "jszip";
import LVLogo from "@/components/LVLogo";
import ClientPhotoCard from "@/components/photo-sessions/ClientPhotoCard";
import ClientLightbox from "@/components/photo-sessions/ClientLightbox";
import PhotoCommentPanel from "@/components/photo-sessions/PhotoCommentPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  useSessionByShareToken,
  usePhotosForSession,
  useSessionComments,
  useUpdatePhotoStatus,
  useFinalizeSession,
} from "@/hooks/usePhotoSessions";
import type { SessionPhoto } from "@/integrations/supabase/types";

// Deliverable signed URLs — fetched via Edge Function for anon clients
async function fetchDeliverableUrls(
  shareToken: string
): Promise<{ id: string; file_name: string; quality: string; signed_url: string }[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const res = await fetch(`${supabaseUrl}/functions/v1/get-deliverable-urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseKey },
    body: JSON.stringify({ share_token: shareToken }),
  });
  if (!res.ok) return [];
  const json = await res.json() as { files: { id: string; file_name: string; quality: string; signed_url: string }[] };
  return json.files ?? [];
}

// Signed URLs fetched via Edge Function for anon clients
async function fetchSignedUrls(
  shareToken: string,
  photoIds: string[]
): Promise<Record<string, string>> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const res = await fetch(`${supabaseUrl}/functions/v1/get-photo-urls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
    },
    body: JSON.stringify({ share_token: shareToken, photo_ids: photoIds }),
  });

  if (!res.ok) return {};
  const json = (await res.json()) as {
    urls: { photo_id: string; signed_url: string | null }[];
  };
  return Object.fromEntries(
    (json.urls ?? []).map((u) => [u.photo_id, u.signed_url ?? ""])
  );
}

export default function ClientPhotoSelection() {
  const { shareToken } = useParams<{ shareToken: string }>();

  const { data: session, isLoading: sessionLoading } = useSessionByShareToken(shareToken);
  const { data: photos = [], isLoading: photosLoading } = usePhotosForSession(session?.id);
  const { data: allComments = [] } = useSessionComments(session?.id);
  const updatePhotoStatus = useUpdatePhotoStatus();
  const finalizeSession = useFinalizeSession();

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [urlsLoading, setUrlsLoading] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<SessionPhoto | null>(null);
  const [commentPhoto, setCommentPhoto] = useState<SessionPhoto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  // Deliverables / download
  type DeliverableFile = { id: string; file_name: string; quality: string; signed_url: string };
  const [deliverableFiles, setDeliverableFiles] = useState<DeliverableFile[]>([]);
  const [delivFilesLoading, setDelivFilesLoading] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipping, setZipping] = useState(false);

  // Fetch signed URLs once photos load
  useEffect(() => {
    if (!shareToken || photos.length === 0) return;
    setUrlsLoading(true);
    fetchSignedUrls(shareToken, photos.map((p) => p.id))
      .then(setSignedUrls)
      .finally(() => setUrlsLoading(false));
  }, [shareToken, photos.length]);

  // Keep lightbox photo in sync with latest status from the query cache
  useEffect(() => {
    if (!lightboxPhoto) return;
    const updated = photos.find((p) => p.id === lightboxPhoto.id);
    if (updated) setLightboxPhoto(updated);
  }, [photos]);

  // If session was already finalized on a prior visit, show done state immediately
  useEffect(() => {
    if (session?.finalized_at) {
      setSubmitDone(true);
      setInvoiceUrl(session.wave_invoice_url ?? null);
    }
  }, [session?.finalized_at]);

  // Fetch deliverable signed URLs when published
  useEffect(() => {
    if (!shareToken || !session?.deliverables_ready_at || !session?.allow_zip_download) return;
    setDelivFilesLoading(true);
    fetchDeliverableUrls(shareToken)
      .then(setDeliverableFiles)
      .finally(() => setDelivFilesLoading(false));
  }, [shareToken, session?.deliverables_ready_at, session?.allow_zip_download]);

  const handleDownloadZip = async (quality: "hd" | "lr" | "all") => {
    const files = quality === "all"
      ? deliverableFiles
      : deliverableFiles.filter((f) => f.quality === quality);

    if (files.length === 0) return;
    setZipping(true);
    setZipProgress(0);

    try {
      const zip = new JSZip();
      const folder = zip.folder(quality === "all" ? "photos" : quality === "hd" ? "photos-hd" : "photos-lr")!;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const blob = await fetch(f.signed_url).then((r) => r.blob());
        folder.file(f.file_name, blob);
        setZipProgress(Math.round(((i + 1) / files.length) * 80));
      }

      const zipBlob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } },
        (meta) => setZipProgress(80 + Math.round(meta.percent * 0.2))
      );

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session?.name ?? "photos"}-${quality}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
      setZipProgress(0);
    }
  };

  // Build comment count map: photo_id → count
  const commentCountByPhotoId = allComments.reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.photo_id] = (acc[c.photo_id] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const selectedCount = photos.filter((p) => p.status === "selected").length;
  const photoLimit = session?.photo_limit ?? 0;
  const extraPrice = Number(session?.extra_photo_price ?? 0);
  const overLimit = photoLimit > 0 ? Math.max(0, selectedCount - photoLimit) : 0;
  const extraTotal = overLimit * extraPrice;

  const handleToggle = (photo: SessionPhoto) => {
    if (submitDone) return; // read-only after confirmation
    const newStatus: SessionPhoto["status"] =
      photo.status === "selected" ? "not_selected" : "selected";
    updatePhotoStatus.mutate({
      photoId: photo.id,
      sessionId: photo.session_id,
      status: newStatus,
    });
  };

  // Soft limit: only disable photos after the client has confirmed (read-only).
  // Selecting beyond the limit is always allowed — extras are invoiced.
  const isDisabled = (photo: SessionPhoto) => submitDone && photo.status !== "selected";

  const handleConfirmSubmit = async () => {
    if (!shareToken) return;
    try {
      const result = await finalizeSession.mutateAsync(shareToken);
      setInvoiceUrl(result.wave_invoice_url);
      setSubmitDone(true);
      setConfirmOpen(false);
    } catch {
      // error toast handled by react-query; keep modal open
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b px-4 py-3 flex items-center gap-3">
          <LVLogo size={32} />
        </div>
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Not found state ────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-6">
        <LVLogo size={32} />
        <p className="text-4xl mt-8 mb-3">🔗</p>
        <p className="text-lg font-semibold mb-1">Session Not Found</p>
        <p className="text-muted-foreground text-sm">
          This link may have expired or is no longer available. Please contact us if you believe this is an error.
        </p>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen bg-background pb-24">
        {/* Sticky top bar */}
        <div className="border-b px-4 py-3 flex items-center justify-between bg-background/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <LVLogo size={32} />
            <div className="hidden sm:block border-l pl-3">
              <p className="font-semibold text-sm">{session.name}</p>
              <p className="text-xs text-muted-foreground">For {session.client_name}</p>
            </div>
          </div>

          {/* Selection counter */}
          <div className="text-right">
            <p className="text-sm font-semibold">
              {selectedCount}
              {photoLimit > 0 ? ` / ${photoLimit}` : ""} selected
            </p>
            {overLimit > 0 && extraPrice > 0 && (
              <p className="text-xs text-amber-600 font-medium">
                +{overLimit} extra · ${extraTotal.toFixed(2)}
              </p>
            )}
            {photoLimit > 0 && selectedCount < photoLimit && (
              <p className="text-xs text-muted-foreground">
                {photoLimit - selectedCount} remaining
              </p>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
          {/* Session title on mobile */}
          <div className="sm:hidden">
            <p className="font-semibold">{session.name}</p>
            <p className="text-sm text-muted-foreground">For {session.client_name}</p>
          </div>

          {/* ── Finalized banner ── */}
          {submitDone && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-green-800 text-sm">Selection received — thank you!</p>
                <p className="text-green-700 text-xs">
                  We will start working on your photography selection. You're all set, we'll be back to you soon.
                </p>
                {overLimit > 0 && extraPrice > 0 && (
                  <p className="text-amber-700 text-xs font-medium">
                    Your selection includes {overLimit} additional photo{overLimit !== 1 ? "s" : ""} beyond your package (+${extraTotal.toFixed(2)}). An invoice will be sent to your email address.
                  </p>
                )}
                {invoiceUrl && (
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                  >
                    <Receipt size={12} />
                    View invoice
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Deliverables download section ── */}
          {session.deliverables_ready_at && session.allow_zip_download && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border">
                <Archive size={15} className="text-muted-foreground" />
                <span className="text-sm font-semibold">Your Edited Photos Are Ready</span>
              </div>
              <div className="p-4 space-y-3">
                {delivFilesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> Loading download links…
                  </div>
                ) : deliverableFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Files are being prepared. Please check back shortly.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Your edited photos are available for download. Choose your preferred resolution below.
                    </p>

                    {zipping && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Preparing ZIP…</span>
                          <span>{zipProgress}%</span>
                        </div>
                        <Progress value={zipProgress} className="h-1.5" />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {deliverableFiles.some((f) => f.quality === "hd") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={zipping}
                          onClick={() => handleDownloadZip("hd")}
                        >
                          <Download size={13} />
                          Download HD ({deliverableFiles.filter(f => f.quality === "hd").length} files)
                        </Button>
                      )}
                      {deliverableFiles.some((f) => f.quality === "lr") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={zipping}
                          onClick={() => handleDownloadZip("lr")}
                        >
                          <Download size={13} />
                          Download Low-res ({deliverableFiles.filter(f => f.quality === "lr").length} files)
                        </Button>
                      )}
                      {deliverableFiles.some((f) => f.quality === "hd") && deliverableFiles.some((f) => f.quality === "lr") && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={zipping}
                          onClick={() => handleDownloadZip("all")}
                        >
                          <Download size={13} />
                          Download All ({deliverableFiles.length} files)
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Files will be bundled into a ZIP. This may take a moment depending on your connection.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Additional photos notice (soft limit) ── */}
          {!submitDone && overLimit > 0 && extraPrice > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-1">
              <p className="font-semibold text-amber-800">
                Additional photos selected
              </p>
              <p className="text-amber-700 text-xs">
                You have selected <strong>{overLimit} photo{overLimit !== 1 ? "s" : ""}</strong> beyond your included package.
                At <strong>${extraPrice.toFixed(2)}</strong> per additional photo, the extra balance is{" "}
                <strong>${extraTotal.toFixed(2)}</strong>. This amount will be reflected in your invoice upon confirmation.
              </p>
            </div>
          )}

          {/* ── Instruction banner (always shown, never changes) ── */}
          <div className="bg-muted rounded-xl p-4 text-sm space-y-1">
            <p className="font-medium text-foreground">How to select your photos:</p>
            <ul className="text-muted-foreground space-y-0.5 text-xs list-none">
              <li>📷 <strong className="text-foreground">Tap a photo</strong> to open it full-size</li>
              <li>✅ <strong className="text-foreground">Tap "Select"</strong> inside the photo to add it to your selection</li>
              <li>💬 <strong className="text-foreground">Tap the chat icon</strong> to leave a comment on any photo</li>
              {photoLimit > 0 && (
                <li>
                  🎯 Your package includes{" "}
                  <strong className="text-foreground">{photoLimit} photos</strong>
                  {extraPrice > 0 && `. You can select more — extra photos are $${extraPrice.toFixed(2)} each and will be invoiced.`}
                </li>
              )}
            </ul>
          </div>

          {/* ── Package info strip ── */}
          {photoLimit > 0 && (
            <div className="grid grid-cols-3 divide-x divide-border border border-border rounded-xl overflow-hidden text-center text-sm">
              <div className="px-4 py-3 space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Package</p>
                <p className="font-bold text-foreground text-base">{photoLimit}</p>
                <p className="text-xs text-muted-foreground">photos included</p>
              </div>
              <div className="px-4 py-3 space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Selected</p>
                <p className={`font-bold text-base ${overLimit > 0 ? "text-amber-600" : "text-foreground"}`}>
                  {selectedCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overLimit > 0 ? `${overLimit} over limit` : `${Math.max(0, photoLimit - selectedCount)} remaining`}
                </p>
              </div>
              <div className="px-4 py-3 space-y-0.5">
                {extraPrice > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Extras</p>
                    <p className={`font-bold text-base ${overLimit > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {overLimit > 0 ? `$${extraTotal.toFixed(2)}` : `$${extraPrice.toFixed(2)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {overLimit > 0 ? `${overLimit} × $${extraPrice.toFixed(2)}` : "per extra photo"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Extras</p>
                    <p className="font-bold text-base text-muted-foreground">∞</p>
                    <p className="text-xs text-muted-foreground">no extra charge</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Photo grid */}
          {photosLoading || urlsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-xl" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-4xl mb-3">📷</p>
              <p className="text-muted-foreground text-sm">No images are available for this session yet. Please check back shortly.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
              {photos.map((photo) => (
                <ClientPhotoCard
                  key={photo.id}
                  photo={photo}
                  onToggle={handleToggle}
                  onViewPhoto={setLightboxPhoto}
                  onComment={(p) => {
                    setLightboxPhoto(null);
                    setCommentPhoto(p);
                  }}
                  disabled={isDisabled(photo)}
                  signedUrl={signedUrls[photo.id] ?? null}
                  commentCount={commentCountByPhotoId[photo.id] ?? 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Sticky bottom CTA — Confirm Selection ── */}
        {!submitDone && selectedCount > 0 && !photosLoading && !urlsLoading && (
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur border-t px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{selectedCount} photo{selectedCount !== 1 ? "s" : ""} selected</span>
              {overLimit > 0 && extraPrice > 0 && (
                <span className="text-amber-600 ml-1.5 text-xs font-medium">
                  · +${extraTotal.toFixed(2)} additional
                </span>
              )}
            </div>
            <Button size="sm" onClick={() => setConfirmOpen(true)} className="gap-1.5 shrink-0">
              <CheckCircle2 size={15} />
              Confirm My Selection
            </Button>
          </div>
        )}
      </div>

      {/* ── Confirmation Sheet ── */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-4 max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left mb-4">
            <SheetTitle>Review &amp; Confirm Your Selection</SheetTitle>
            <SheetDescription>
              Please review the summary below before submitting. Once confirmed, our team will begin processing your photos.
            </SheetDescription>
          </SheetHeader>

          {/* Summary table */}
          <div className="bg-muted rounded-xl p-4 space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total photos selected</span>
              <span className="font-semibold">{selectedCount}</span>
            </div>
            {photoLimit > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Included in your package</span>
                <span className="font-semibold">{Math.min(selectedCount, photoLimit)}</span>
              </div>
            )}
            {overLimit > 0 && extraPrice > 0 && (
              <>
                <div className="border-t pt-2 flex justify-between text-amber-700">
                  <span>Additional photos ({overLimit} × ${extraPrice.toFixed(2)})</span>
                  <span className="font-semibold">${extraTotal.toFixed(2)}</span>
                </div>
                <p className="text-xs text-amber-600 pt-1">
                  An invoice for the additional photos will be sent to your registered email address upon confirmation.
                </p>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Go Back
            </Button>
            <Button
              className="flex-1 gap-1.5"
              disabled={finalizeSession.isPending}
              onClick={handleConfirmSubmit}
            >
              {finalizeSession.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                : <><CheckCircle2 size={15} /> Confirm &amp; Submit</>
              }
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Lightbox — full-screen photo viewer */}
      <ClientLightbox
        photo={lightboxPhoto}
        photos={photos}
        signedUrls={signedUrls}
        commentCountByPhotoId={commentCountByPhotoId}
        onClose={() => setLightboxPhoto(null)}
        onNavigate={setLightboxPhoto}
        onToggle={handleToggle}
        onComment={(p) => {
          setLightboxPhoto(null);
          setCommentPhoto(p);
        }}
        disabled={lightboxPhoto ? isDisabled(lightboxPhoto) : false}
      />

      {/* Comment panel — side sheet */}
      <PhotoCommentPanel
        photo={commentPhoto}
        sessionId={session.id}
        orgId={session.org_id}
        authorLabel={session.client_name}
        authorUserId={null}
        onClose={() => setCommentPhoto(null)}
      />
    </>
  );
}
