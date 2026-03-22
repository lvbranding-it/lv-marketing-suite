import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Send, Users, Mail, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import RecipientSelector from "@/components/campaigns/RecipientSelector";
import EmailComposer     from "@/components/campaigns/EmailComposer";
import { useCreateCampaign, useSendCampaign, type SelectedRecipient } from "@/hooks/useCampaigns";
import { useToast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1 as Step, label: "Recipients", icon: Users },
  { n: 2 as Step, label: "Compose",    icon: Mail  },
  { n: 3 as Step, label: "Send",       icon: Send  },
];

export default function CampaignComposer() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step,         setStep]         = useState<Step>(1);
  const [recipients,   setRecipients]   = useState<SelectedRecipient[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [subject,      setSubject]      = useState("");
  const [previewText,  setPreviewText]  = useState("");
  const [bodyHtml,     setBodyHtml]     = useState("");
  const [sending,      setSending]      = useState(false);

  const createCampaign = useCreateCampaign();
  const sendCampaign   = useSendCampaign();

  const canGoNext = (): boolean => {
    if (step === 1) return recipients.length > 0;
    if (step === 2) return !!campaignName.trim() && !!subject.trim() && !!bodyHtml.trim();
    return true;
  };

  const handleSend = async () => {
    setSending(true);
    try {
      // 1. Create campaign + insert recipients
      const campaign = await createCampaign.mutateAsync({
        name:        campaignName,
        subject,
        preview_text: previewText,
        body_html:   bodyHtml,
        recipients,
      });
      // 2. Trigger send
      const result = await sendCampaign.mutateAsync(campaign.id);
      toast({ description: `✅ Campaign sent to ${result.sent} contacts!` });
      navigate(`/campaigns/${campaign.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Send failed";
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
        <h1 className="text-sm font-semibold hidden sm:block">New Campaign</h1>
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
        <div className="max-w-3xl mx-auto">

          {/* Step 1 — Recipients */}
          {step === 1 && (
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

          {/* Step 2 — Compose */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">Compose Email</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Describe your campaign and let AI draft it, then edit as needed.
                </p>
              </div>
              <EmailComposer
                campaignName={campaignName}      onCampaignNameChange={setCampaignName}
                subject={subject}                onSubjectChange={setSubject}
                previewText={previewText}        onPreviewTextChange={setPreviewText}
                bodyHtml={bodyHtml}              onBodyHtmlChange={setBodyHtml}
                recipientCount={recipients.length}
              />
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

              {/* Send button */}
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
