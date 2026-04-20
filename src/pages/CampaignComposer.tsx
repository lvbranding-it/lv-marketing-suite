import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Send, Users, Mail, CheckCircle2, Loader2, AlertCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import RecipientSelector from "@/components/campaigns/RecipientSelector";
import EmailComposer     from "@/components/campaigns/EmailComposer";
import {
  useCreateCampaign,
  useSendCampaign,
  useUpdateCampaign,
  useUpsertCampaignRecipients,
  useCampaign,
  useCampaignRecipients,
  type SelectedRecipient,
  type EmailCampaign,
} from "@/hooks/useCampaigns";
import { usePermissions } from "@/hooks/usePermissions";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/hooks/use-toast";
import BranchSelect from "@/components/branches/BranchSelect";
import type { BranchFilterValue } from "@/hooks/useBranches";

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1 as Step, label: "Compose",    icon: Mail  },
  { n: 2 as Step, label: "Recipients", icon: Users },
  { n: 3 as Step, label: "Send",       icon: Send  },
];

export default function CampaignComposer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const editId = searchParams.get("edit");

  const cloneData = location.state?.cloneFrom as {
    name: string; subject: string; preview_text: string; body_html: string;
  } | undefined;

  const [step,         setStep]         = useState<Step>(1);
  const [recipients,   setRecipients]   = useState<SelectedRecipient[]>([]);
  const [campaignName, setCampaignName] = useState(cloneData?.name ?? "");
  const [subject,      setSubject]      = useState(cloneData?.subject ?? "");
  const [previewText,  setPreviewText]  = useState(cloneData?.preview_text ?? "");
  const [bodyHtml,     setBodyHtml]     = useState(cloneData?.body_html ?? "");
  const [branchId,     setBranchId]     = useState<BranchFilterValue>("unassigned");
  const [sending,      setSending]      = useState(false);

  // Edit mode: load existing campaign
  const { data: existingCampaign } = useCampaign(editId);
  const { data: existingRecipients = [] } = useCampaignRecipients(editId);

  // Populate form when editing
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (existingCampaign && !initialized && !cloneData) {
      setCampaignName(existingCampaign.name ?? "");
      setSubject(existingCampaign.subject ?? "");
      setPreviewText(existingCampaign.preview_text ?? "");
      setBodyHtml(existingCampaign.body_html ?? "");
      setBranchId(existingCampaign.branch_id ?? "unassigned");
      setInitialized(true);
    }
  }, [existingCampaign, initialized, cloneData]);

  useEffect(() => {
    if (existingRecipients.length > 0 && !initialized) {
      setRecipients(existingRecipients.map((r) => ({
        id: r.id,
        email: r.email ?? "",
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        company: r.company ?? null,
        title: r.title ?? null,
        contact_id: r.contact_id ?? null,
      })));
    }
  }, [existingRecipients, initialized]);

  // Draft ID tracking + save state
  const [draftId, setDraftId] = useState<string | null>(editId);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { canSendCampaigns, isMember } = usePermissions();
  const { log } = useActivityLog();

  const createCampaign   = useCreateCampaign();
  const sendCampaign     = useSendCampaign();
  const updateCampaign   = useUpdateCampaign();
  const upsertRecipients = useUpsertCampaignRecipients();

  const canGoNext = (): boolean => {
    if (step === 1) return !!campaignName.trim() && !!subject.trim() && !!bodyHtml.trim();
    if (step === 2) return recipients.length > 0;
    return true;
  };

  const saveDraft = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setSaveStatus("saving");
    try {
      if (draftId) {
        // Update existing draft
        await updateCampaign.mutateAsync({
          id: draftId,
          name: campaignName || "Untitled Draft",
          subject,
          preview_text: previewText,
          body_html: bodyHtml,
          recipient_count: recipients.length,
          branch_id: branchId === "unassigned" ? null : branchId,
        });
        if (recipients.length > 0) {
          await upsertRecipients.mutateAsync({ campaignId: draftId, recipients });
        }
      } else {
        // Create new draft
        const campaign = await createCampaign.mutateAsync({
          name: campaignName || "Untitled Draft",
          subject,
          preview_text: previewText,
          body_html: bodyHtml,
          recipients,
          branch_id: branchId === "unassigned" ? null : branchId,
        });
        setDraftId(campaign.id);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
      if (!opts?.silent) toast({ variant: "destructive", description: "Failed to save draft." });
    }
  };

  // Auto-save with 2-second debounce.
  // Skip until campaign data has been loaded (edit mode) to avoid writing
  // stale/empty state back to the DB before the form is populated.
  useEffect(() => {
    if (editId && !initialized) return;          // still loading — don't auto-save yet
    if (!campaignName && !subject && !bodyHtml && recipients.length === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveDraft({ silent: true });
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignName, subject, previewText, bodyHtml, recipients, branchId, initialized]);

  const handleSend = async () => {
    setSending(true);
    try {
      let campaignToSend: EmailCampaign;
      if (draftId) {
        // Update the existing draft first
        await updateCampaign.mutateAsync({
          id: draftId,
          name: campaignName,
          subject,
          preview_text: previewText,
          body_html: bodyHtml,
          recipient_count: recipients.length,
          branch_id: branchId === "unassigned" ? null : branchId,
        });
        await upsertRecipients.mutateAsync({ campaignId: draftId, recipients });
        campaignToSend = { id: draftId } as EmailCampaign;
      } else {
        campaignToSend = await createCampaign.mutateAsync({
          name: campaignName,
          subject,
          preview_text: previewText,
          body_html: bodyHtml,
          recipients,
          branch_id: branchId === "unassigned" ? null : branchId,
        });
      }
      const result = await sendCampaign.mutateAsync(campaignToSend.id);
      toast({ description: `✅ Campaign sent to ${result.sent} contacts!` });
      navigate(`/campaigns/${campaignToSend.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Send failed";
      toast({ variant: "destructive", description: msg });
      setSending(false);
    }
  };

  const handleSubmitForApproval = async () => {
    setSending(true);
    try {
      let campaignToSubmit: EmailCampaign;
      if (draftId) {
        await updateCampaign.mutateAsync({
          id: draftId,
          name: campaignName,
          subject,
          preview_text: previewText,
          body_html: bodyHtml,
          recipient_count: recipients.length,
          branch_id: branchId === "unassigned" ? null : branchId,
        });
        await upsertRecipients.mutateAsync({ campaignId: draftId, recipients });
        campaignToSubmit = { id: draftId } as EmailCampaign;
      } else {
        campaignToSubmit = await createCampaign.mutateAsync({
          name:         campaignName,
          subject,
          preview_text: previewText,
          body_html:    bodyHtml,
          recipients,
          branch_id:    branchId === "unassigned" ? null : branchId,
          status:       "pending_approval",
        });
      }
      log("submitted_campaign", "campaign", campaignToSubmit.id, campaignName);
      toast({ description: "Campaign submitted for approval. A manager will review it shortly." });
      navigate("/campaigns");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      toast({ variant: "destructive", description: msg });
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="border-b border-border px-3 sm:px-6 py-3 flex items-center gap-4 bg-background shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate("/campaigns")} className="gap-1.5 -ml-2">
          <ArrowLeft size={14} /> Campaigns
        </Button>
        <h1 className="text-sm font-semibold hidden sm:block">
          {editId && existingCampaign?.status !== "draft" ? "Edit Campaign (New Draft)" : editId ? "Edit Draft" : "New Campaign"}
        </h1>
        {/* Save status indicator */}
        {saveStatus === "saving" && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> Saving…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="text-[10px] text-emerald-600 flex items-center gap-1">
            <Save size={10} /> Saved
          </span>
        )}
        {/* Step indicator */}
        <div className="flex items-center gap-1 ml-auto">
          {STEPS.map((s, idx) => {
            const done    = step > s.n;
            const current = step === s.n;
            return (
              <div key={s.n} className="flex items-center gap-1">
                <button
                  onClick={() => done && setStep(s.n)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                    current  ? "bg-primary text-primary-foreground"
                    : done   ? "bg-primary/15 text-primary cursor-pointer hover:bg-primary/25"
                    :          "bg-muted text-muted-foreground"
                  )}
                >
                  {done
                    ? <CheckCircle2 size={11} />
                    : <s.icon size={11} />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn("h-px w-4 sm:w-6", done ? "bg-primary" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className={cn(step === 1 ? "w-full" : "max-w-3xl mx-auto")}>

          {/* Step 1 — Compose
              IMPORTANT: for edit mode we must NOT mount EmailComposer until the
              campaign data has loaded from the DB.  EmailComposer initialises its
              internal tiptapHtml on first mount; if it mounts with bodyHtml=""
              and later receives the real content as a prop change, the guard
              `if (!initialized)` prevents the re-sync and the editor stays empty.
              Solution: delay rendering until `initialized` is true (or there is
              no editId, meaning it's a brand-new campaign).              */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">Compose Email</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Describe your campaign and let AI draft it, then edit as needed.
                </p>
              </div>
              <BranchSelect
                mode="assign"
                value={branchId}
                onValueChange={setBranchId}
                className="max-w-xs"
              />

              {/* Wait for existing campaign data before mounting the composer */}
              {editId && !initialized ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Loader2 size={22} className="animate-spin mr-2" />
                  <span className="text-sm">Loading draft…</span>
                </div>
              ) : (
                <EmailComposer
                  key={editId ?? "new"}
                  campaignName={campaignName}      onCampaignNameChange={setCampaignName}
                  subject={subject}                onSubjectChange={setSubject}
                  previewText={previewText}        onPreviewTextChange={setPreviewText}
                  bodyHtml={bodyHtml}              onBodyHtmlChange={setBodyHtml}
                  recipientCount={recipients.length}
                />
              )}
            </div>
          )}

          {/* Step 2 — Recipients */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">Select Recipients</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose who receives this campaign. Suppressed contacts (unsubscribed or bounced) are automatically excluded.
                </p>
              </div>
              <RecipientSelector selected={recipients} onChange={setRecipients} />
            </div>
          )}

          {/* Step 3 — Review & Send */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Review &amp; Send</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Double-check everything before sending. This cannot be undone.
                </p>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Campaign</p>
                  <p className="text-sm font-semibold">{campaignName}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Recipients</p>
                  <p className="text-2xl font-bold">{recipients.length}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">From</p>
                  <p className="text-sm font-semibold">LV Branding</p>
                  <p className="text-[10px] text-muted-foreground">admin@lvbranding.com</p>
                </div>
              </div>

              {/* Subject preview */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Subject</span>
                  <p className="text-sm font-medium mt-0.5">{subject}</p>
                </div>
                {previewText && (
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{previewText}</p>
                  </div>
                )}
              </div>

              {/* Email preview */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Email Preview</p>
                <div className="border border-border rounded-xl overflow-hidden bg-[#f4f4f5] p-3">
                  <div className="bg-white rounded-lg p-4 sm:p-6 border border-border text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: bodyHtml
                        .replace(/\{\{first_name\}\}/g, "Sarah")
                        .replace(/\{\{company\}\}/g, "Acme Corp")
                        .replace(/\{\{title\}\}/g, "Marketing Director"),
                    }}
                  />
                </div>
              </div>

              {/* Compliance note */}
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  An unsubscribe link is automatically added to every email. Suppressed contacts are skipped.
                  By sending you confirm this list was obtained with proper consent.
                </p>
              </div>

              {/* Save Draft button on Step 3 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveDraft()}
                className="gap-1.5 mb-3 w-full sm:w-auto"
              >
                <Save size={13} /> Save Draft
              </Button>

              {/* Send / Submit button */}
              {isMember && !canSendCampaigns ? (
                <Button
                  size="lg"
                  onClick={handleSubmitForApproval}
                  disabled={sending}
                  className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {sending
                    ? <><Loader2 size={15} className="animate-spin" />Submitting…</>
                    : <><Send size={15} />Submit for Approval ({recipients.length} recipients)</>}
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleSend}
                  disabled={sending}
                  className="w-full gap-2"
                >
                  {sending
                    ? <><Loader2 size={15} className="animate-spin" />Sending to {recipients.length} contacts…</>
                    : <><Send size={15} />Send to {recipients.length} contacts</>}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      {step < 3 && (
        <div className="border-t border-border px-3 sm:px-6 py-3 flex justify-between items-center bg-background shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => (s - 1) as Step)}
            disabled={step === 1}
            className="gap-1.5"
          >
            <ArrowLeft size={14} /> Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveDraft()}
            disabled={updateCampaign.isPending || createCampaign.isPending}
            className="gap-1.5"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Save Draft</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={!canGoNext()}
            className="gap-1.5"
          >
            Next <ArrowRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
