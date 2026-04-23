import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Copy, Check, ExternalLink, Trash2, Eye, Mail,
  Calendar, Building2, ClipboardList, ChevronDown,
  FolderPlus, Loader2, CheckCircle2, ArrowRight, AlertCircle,
  Search, X, UserCheck, Send,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useImportedContacts, type ImportedContact } from "@/hooks/useContacts";
import { useToast } from "@/hooks/use-toast";
import { useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import { runSkillStream } from "@/lib/claude";
import { getSkill } from "@/data/skills";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface IntakeSubmission {
  id: string;
  org_id: string;
  created_at: string;
  status: "new" | "reviewed" | "converted";
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  company_name: string | null;
  form_data: Record<string, unknown>;
  contact_id: string | null;
}

type ConvertState = "idle" | "creating" | "generating" | "done" | "error";

const STATUS_META: Record<string, { label: string; class: string }> = {
  new:       { label: "New",       class: "bg-rose-100 text-rose-700 border-rose-200" },
  reviewed:  { label: "Reviewed",  class: "bg-amber-100 text-amber-700 border-amber-200" },
  converted: { label: "Converted", class: "bg-green-100 text-green-700 border-green-200" },
};

// ── Detail section helpers ─────────────────────────────────────────────────────
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <div className="bg-gray-50 rounded-lg p-4 space-y-2.5 border border-gray-100">{children}</div>
    </div>
  );
}
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
    </div>
  );
}

// ── Prompt builder — maps intake fields → marketing context prompt ─────────────
function buildContextPrompt(fd: Record<string, string>, sub: IntakeSubmission): string {
  return `Please create a comprehensive product marketing context document based on the following client brief:

## Product Details
- **Product/Company Name:** ${sub.company_name ?? ""}
${fd.website ? `- **Website:** ${fd.website}` : ""}
${fd.one_liner ? `- **One-liner:** ${fd.one_liner}` : ""}
${fd.industry ? `- **Category/Industry:** ${fd.industry}` : ""}
${fd.company_size ? `- **Company Size:** ${fd.company_size}` : ""}
${fd.business_model ? `- **Business Model:** ${fd.business_model}` : ""}

## Target Audience
${fd.ideal_customer ? `- **Ideal Customer:** ${fd.ideal_customer}` : ""}
${fd.top_problem ? `- **Top Problem Solved:** ${fd.top_problem}` : ""}
${fd.goals ? `- **Goals & Jobs to Be Done:** ${fd.goals}` : ""}
${fd.timeline ? `- **Timeline:** ${fd.timeline}` : ""}

## Competition & Differentiation
${fd.competitors ? `- **Top Competitors:** ${fd.competitors}` : ""}
${fd.differentiators ? `- **Key Differentiators:** ${fd.differentiators}` : ""}

## Brand Voice
${fd.tone ? `- **Tone:** ${fd.tone}` : ""}
${fd.extra_notes ? `- **Additional Context:** ${fd.extra_notes}` : ""}

## Contact
- **Submitted by:** ${sub.contact_name ?? ""} (${sub.contact_role ?? ""}) · ${sub.contact_email ?? ""}

Please produce a comprehensive, well-structured marketing context document that all marketing skills can reference. Include insights and recommendations based on the information provided.`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Intake() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { org } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const [copied, setCopied]           = useState(false);
  const [selected, setSelected]       = useState<IntakeSubmission | null>(null);
  const [convertState, setConvertState] = useState<ConvertState>("idle");
  const [streamedText, setStreamedText] = useState("");
  const [convertError, setConvertError] = useState("");
  const [newProjectId, setNewProjectId] = useState<string | null>(null);

  // ── Personalized link state ──────────────────────────────────────────────────
  const [contactQuery, setContactQuery]             = useState("");
  const [pickedContact, setPickedContact]           = useState<ImportedContact | null>(null);
  const [showDropdown, setShowDropdown]             = useState(false);
  const [clientLinkCopied, setClientLinkCopied]     = useState(false);
  const dropdownRef                                 = useRef<HTMLDivElement>(null);

  const { data: allContacts = [] } = useImportedContacts();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredContacts = allContacts
    .filter((c) => {
      if (!contactQuery.trim()) return false;
      const q = contactQuery.toLowerCase();
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (c.company ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
    })
    .slice(0, 8);

  const buildPersonalizedLink = (c: ImportedContact) => {
    if (!org) return "";
    const p = new URLSearchParams();
    p.set("cid", c.id);
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (name)               p.set("n", name);
    if (c.email)            p.set("e", c.email);
    if (c.title)            p.set("r", c.title);
    if (c.company)          p.set("c", c.company);
    if (c.website)          p.set("w", c.website);
    if (c.industry)         p.set("i", c.industry);
    if (c.employees_range)  p.set("s", c.employees_range);
    return `${window.location.origin}/intake/${org.id}?${p.toString()}`;
  };

  const personalizedLink = pickedContact ? buildPersonalizedLink(pickedContact) : "";

  const copyClientLink = () => {
    if (!personalizedLink) return;
    navigator.clipboard.writeText(personalizedLink);
    setClientLinkCopied(true);
    setTimeout(() => setClientLinkCopied(false), 2000);
    toast({ description: "Personalized link copied!" });
  };

  const emailClient = () => {
    if (!pickedContact || !personalizedLink) return;
    const first = pickedContact.first_name ?? "there";
    setEmailSubject("Your Client Brief — LV Branding");
    setEmailMessage(
      `Hi ${first},\n\nWe're thrilled to be working with you on this next chapter! To help us hit the ground running, we've put together a quick brief — it takes about 5 minutes, and we've already pre-filled what we know.\n\nLooking forward to bringing your vision to life!`
    );
    setEmailSenderName("");
    setEmailSentTo(null);
    setShowEmailPreview(true);
  };

  const sendEmail = async () => {
    if (!pickedContact || !personalizedLink) return;
    setSendingEmail(true);
    try {
      const toName = `${pickedContact.first_name ?? ""} ${pickedContact.last_name ?? ""}`.trim() || pickedContact.company || undefined;
      const { error } = await supabase.functions.invoke("send-intake-invite", {
        body: {
          to_email:    pickedContact.email,
          to_name:     toName,
          subject:     emailSubject,
          message:     emailMessage,
          sender_name: emailSenderName.trim() || "The LV Branding Team",
          intake_link: personalizedLink,
        },
      });
      if (error) throw error;
      setEmailSentTo(pickedContact.email ?? "");
      toast({ description: `Email sent to ${pickedContact.email}!` });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to send email.",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const clearPicked = () => {
    setPickedContact(null);
    setContactQuery("");
    setShowDropdown(false);
  };

  // ── Email preview panel state ─────────────────────────────────────────────
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailSubject, setEmailSubject]         = useState("");
  const [emailMessage, setEmailMessage]         = useState("");
  const [emailSenderName, setEmailSenderName]   = useState("");
  const [sendingEmail, setSendingEmail]         = useState(false);
  const [emailSentTo, setEmailSentTo]           = useState<string | null>(null);

  const intakeUrl = org ? `${window.location.origin}/intake/${org.id}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(intakeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ description: "Intake link copied!" });
  };

  // ── Fetch submissions ────────────────────────────────────────────────────────
  const { data: submissions = [], isLoading } = useQuery<IntakeSubmission[]>({
    queryKey: ["intake_submissions", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("intake_submissions")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IntakeSubmission[];
    },
    enabled: !!org,
  });

  // ── Update status ────────────────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("intake_submissions")
        .update({ status: status as "new" | "reviewed" | "converted" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intake_submissions"] }),
  });

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deleteSubmission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("intake_submissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake_submissions"] });
      closeModal();
      toast({ description: "Submission deleted." });
    },
  });

  // ── Close + reset ─────────────────────────────────────────────────────────────
  const closeModal = () => {
    setSelected(null);
    setConvertState("idle");
    setStreamedText("");
    setConvertError("");
    setNewProjectId(null);
  };

  // ── Convert to Project ────────────────────────────────────────────────────────
  const convertToProject = async (sub: IntakeSubmission) => {
    const pmcSkill = getSkill("product-marketing-context");
    if (!pmcSkill) { toast({ variant: "destructive", description: "Skill not found." }); return; }

    setConvertState("creating");
    setStreamedText("");
    setConvertError("");

    // 1. Create the project
    let project;
    try {
      project = await createProject.mutateAsync({
        name: sub.company_name ?? "New Client",
        client_name: sub.contact_name ?? undefined,
        description: sub.contact_email ?? undefined,
      });
      setNewProjectId(project.id);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Failed to create project.");
      setConvertState("error");
      return;
    }

    // 2. Stream context generation
    setConvertState("generating");
    const fd = sub.form_data as Record<string, string>;
    const prompt = buildContextPrompt(fd, sub);
    let fullText = "";

    await runSkillStream(
      {
        skillSystemPrompt: `${pmcSkill.systemPrompt}\n\n${
          language === "es"
            ? "Important: respond in Spanish for all user-facing content. Keep brand names, product names, URLs, code, metrics, and technical acronyms unchanged when appropriate."
            : "Important: respond in English for all user-facing content unless the user explicitly asks otherwise."
        }`,
        userMessage: prompt,
        conversationHistory: [],
        marketingContext: {},
      },
      {
        onToken: (token) => {
          fullText += token;
          setStreamedText((prev) => prev + token);
        },
        onComplete: async (text) => {
          // 3. Parse sections
          const sections: Record<string, string> = {};
          const sectionRegex = /^#{1,3}\s+(.+)\n([\s\S]*?)(?=^#{1,3}\s+|\s*$)/gm;
          let match;
          while ((match = sectionRegex.exec(text)) !== null) {
            sections[match[1].trim()] = match[2].trim();
          }

          try {
            // 4. Save context to project
            await updateProject.mutateAsync({
              id: project.id,
              marketing_context: {
                raw_markdown: text,
                sections,
                generated_at: new Date().toISOString(),
                intake_submission_id: sub.id,
                intake_inputs: fd,
              },
              context_complete: true,
            });

            // 5. Mark submission as converted
            await supabase
              .from("intake_submissions")
              .update({ status: "converted" })
              .eq("id", sub.id);

            qc.invalidateQueries({ queryKey: ["intake_submissions"] });
            setConvertState("done");
          } catch (err) {
            setConvertError(err instanceof Error ? err.message : "Failed to save context.");
            setConvertState("error");
          }
        },
        onError: (err) => {
          setConvertError(err.message);
          setConvertState("error");
        },
      }
    );
  };

  const fd = (s: IntakeSubmission) => s.form_data as Record<string, string>;
  const isConverting = convertState !== "idle";

  return (
    <AppShell>
      <Header title="Client Intake" />

      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Share card ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-100 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Your Intake Link</h2>
              <p className="text-sm text-gray-500 mb-3">
                Share this link with new prospects or clients. It opens a beautiful branded form — no login needed.
              </p>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-md">
                <span className="text-xs text-gray-500 truncate flex-1 font-mono">{intakeUrl}</span>
                <Button size="sm" variant="ghost" onClick={copyLink} className="h-7 w-7 p-0 shrink-0">
                  {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <Button size="sm" className="gap-1.5 bg-rose-500 hover:bg-rose-600" asChild>
                <a href={intakeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  Preview Form
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Personalized link ──────────────────────────────────────────────── */}
        <div className="bg-white border border-border rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <UserCheck size={16} className="text-rose-500" />
              Send to an Existing Client
            </h2>
            <p className="text-sm text-gray-500">
              Pick a contact from your CRM to generate a personalized intake link — their info is pre-filled and they get a warm, client-specific welcome.
            </p>
          </div>

          {/* Contact search */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-rose-300 transition-colors">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                placeholder="Search by name, company or email…"
                value={contactQuery}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setPickedContact(null);
                  setShowDropdown(true);
                }}
                onFocus={() => { if (contactQuery) setShowDropdown(true); }}
              />
              {(pickedContact || contactQuery) && (
                <button onClick={clearPicked} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && filteredContacts.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {filteredContacts.map((c) => {
                  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.company || "—";
                  const initial = (c.first_name?.[0] ?? c.company?.[0] ?? "?").toUpperCase();
                  return (
                    <button
                      key={c.id}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPickedContact(c);
                        setContactQuery(name);
                        setShowDropdown(false);
                      }}
                    >
                      <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                        <p className="text-xs text-gray-400 truncate">{[c.company, c.email].filter(Boolean).join(" · ")}</p>
                      </div>
                      {c.pipeline_stage && (
                        <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground shrink-0 capitalize">
                          {c.pipeline_stage}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Generated link + actions */}
          {pickedContact && (
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-emerald-200 text-emerald-700 text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {(pickedContact.first_name?.[0] ?? pickedContact.company?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-emerald-800">
                    {`${pickedContact.first_name ?? ""} ${pickedContact.last_name ?? ""}`.trim() || pickedContact.company}
                    {pickedContact.company && pickedContact.first_name && (
                      <span className="font-normal text-emerald-600"> · {pickedContact.company}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-emerald-600 truncate font-mono mt-0.5 break-all">{personalizedLink}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyClientLink} className="gap-1.5 flex-1">
                  {clientLinkCopied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                  {clientLinkCopied ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  size="sm"
                  onClick={emailClient}
                  disabled={!pickedContact.email}
                  className="gap-1.5 flex-1 bg-rose-500 hover:bg-rose-600 text-white"
                >
                  <Mail size={13} />
                  Email Client
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {(["new", "reviewed", "converted"] as const).map((s) => {
            const count = submissions.filter((x) => x.status === s).length;
            const m = STATUS_META[s];
            return (
              <div key={s} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold border", m.class)}>
                  {count}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-medium">{count === 1 ? "submission" : "submissions"}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="text-sm font-semibold">
              Submissions
              <span className="ml-2 text-xs font-normal text-muted-foreground">{submissions.length} total</span>
            </h3>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading submissions…</div>
          ) : submissions.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">No submissions yet</p>
              <p className="text-xs text-gray-400 mt-1">Share the intake link above to start receiving briefs.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Received</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => { setSelected(sub); setConvertState("idle"); }}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-foreground">{sub.contact_name ?? "—"}</p>
                        {sub.contact_id && (
                          <span title="Submitted via personalized CRM link" className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                            <UserCheck size={9} /> CRM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail size={10} />{sub.contact_email ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{sub.company_name ?? "—"}</p>
                      {sub.contact_role && <p className="text-xs text-muted-foreground">{sub.contact_role}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={sub.status}
                        onValueChange={(v) => updateStatus.mutate({ id: sub.id, status: v })}
                      >
                        <SelectTrigger className={cn("h-7 text-xs border rounded-full px-2.5 w-28", STATUS_META[sub.status]?.class)}>
                          <SelectValue />
                          <ChevronDown size={11} className="ml-1 opacity-60" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="reviewed">Reviewed</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                        <Eye size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={closeModal}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0">

          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold truncate">
                  {selected?.company_name ?? "Brief"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {selected?.contact_name} · {selected?.contact_email}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0 mr-6">
                {selected && !isConverting && (
                  <Badge className={cn("text-xs border", STATUS_META[selected.status]?.class)}>
                    {STATUS_META[selected.status]?.label}
                  </Badge>
                )}
              </div>
            </div>

            {selected && !isConverting && (
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {new Date(selected.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}
                    </span>
                    {selected.contact_role && (
                      <span className="flex items-center gap-1">
                        <Building2 size={11} />{selected.contact_role}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => selected && deleteSubmission.mutate(selected.id)}
                  >
                    <Trash2 size={11} /> Delete
                  </Button>
                </div>
                {selected.status !== "converted" && (
                  <Button
                    size="sm"
                    onClick={() => convertToProject(selected)}
                    className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <FolderPlus size={14} />
                    Convert to Project
                  </Button>
                )}
                {selected.status === "converted" && newProjectId && (
                  <Button size="sm" variant="outline" onClick={() => { closeModal(); navigate(`/projects/${newProjectId}`); }} className="gap-1.5">
                    <ArrowRight size={14} />
                    Open Project
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>

          {/* ── Conversion flow ──────────────────────────────────────────────── */}
          {convertState === "creating" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Creating project…</p>
            </div>
          )}

          {convertState === "generating" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 size={13} className="animate-spin text-primary" />
                  <p className="text-xs font-medium text-foreground">
                    Generating marketing context document…
                  </p>
                </div>
                <Progress
                  value={Math.min(95, (streamedText.length / 2500) * 100)}
                  className="h-1"
                />
              </div>
              <ScrollArea className="flex-1 px-6 py-4">
                <div className="bg-card border border-border rounded-xl px-5 py-4">
                  <MarkdownContent>{streamedText || "Starting…"}</MarkdownContent>
                  <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle mt-1" />
                </div>
              </ScrollArea>
            </div>
          )}

          {convertState === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={36} className="text-green-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground mb-1">Project Created!</p>
                <p className="text-sm text-muted-foreground">
                  <strong>{selected?.company_name}</strong>'s marketing context is ready.
                  All AI skills will use it automatically.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={closeModal}>Close</Button>
                <Button
                  onClick={() => { closeModal(); navigate(`/projects/${newProjectId}`); }}
                  className="gap-2"
                >
                  Open Project
                  <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {convertState === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <AlertCircle size={36} className="text-destructive" />
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Something went wrong</p>
                <p className="text-xs text-muted-foreground">{convertError}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={closeModal}>Close</Button>
                <Button onClick={() => selected && convertToProject(selected)}>Retry</Button>
              </div>
            </div>
          )}

          {/* ── Normal detail view ───────────────────────────────────────────── */}
          {convertState === "idle" && selected && (
            <ScrollArea className="flex-1 px-6 py-5">
              <div className="space-y-5">
                {selected.contact_id && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700">
                    <UserCheck size={13} className="text-emerald-500 shrink-0" />
                    Submitted via a personalized link from your CRM
                  </div>
                )}
                <DetailSection title="Contact & Company">
                  <DetailRow label="Full Name"    value={selected.contact_name} />
                  <DetailRow label="Email"        value={selected.contact_email} />
                  <DetailRow label="Role / Title" value={selected.contact_role} />
                  <DetailRow label="Company"      value={selected.company_name} />
                  <DetailRow label="Website"      value={fd(selected).website} />
                </DetailSection>

                <Separator />

                <DetailSection title="Business">
                  <DetailRow label="Industry"       value={fd(selected).industry} />
                  <DetailRow label="Company Size"   value={fd(selected).company_size} />
                  <DetailRow label="Business Model" value={fd(selected).business_model} />
                  <DetailRow label="One-Liner"      value={fd(selected).one_liner} />
                </DetailSection>

                <Separator />

                <DetailSection title="Goals & Audience">
                  <DetailRow label="Goals"          value={fd(selected).goals} />
                  <DetailRow label="Ideal Customer" value={fd(selected).ideal_customer} />
                  <DetailRow label="Top Pain Point" value={fd(selected).top_problem} />
                  <DetailRow label="Timeline"       value={fd(selected).timeline} />
                </DetailSection>

                <Separator />

                <DetailSection title="Brand & Competition">
                  <DetailRow label="Competitors"     value={fd(selected).competitors} />
                  <DetailRow label="Differentiators" value={fd(selected).differentiators} />
                  <DetailRow label="Brand Tone"      value={fd(selected).tone} />
                  <DetailRow label="Extra Notes"     value={fd(selected).extra_notes} />
                </DetailSection>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Email preview dialog ─────────────────────────────────────────────── */}
      <Dialog open={showEmailPreview} onOpenChange={(open) => { if (!open) setShowEmailPreview(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={15} className="text-rose-500" />
              Email Preview
            </DialogTitle>
            <DialogDescription>
              Review and edit before sending to <strong>{pickedContact?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          {emailSentTo ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={30} className="text-green-500" />
              </div>
              <p className="font-semibold text-foreground">Email sent!</p>
              <p className="text-sm text-muted-foreground">
                The personalized brief was sent to <strong>{emailSentTo}</strong>.
              </p>
              <Button className="mt-2" onClick={() => setShowEmailPreview(false)}>Done</Button>
            </div>
          ) : (
            /* ── Compose state ── */
            <div className="space-y-4 pt-1">

              {/* To / From pill */}
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-11 shrink-0 text-xs pt-0.5">To</span>
                  <span className="font-medium text-foreground">
                    {[`${pickedContact?.first_name ?? ""} ${pickedContact?.last_name ?? ""}`.trim(), pickedContact?.email].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-11 shrink-0 text-xs pt-0.5">From</span>
                  <span className="text-muted-foreground">LV Branding &lt;admin@lvbranding.com&gt;</span>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Subject</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject line…"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Message</Label>
                <Textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  rows={7}
                  className="resize-none text-sm leading-relaxed"
                  placeholder="Write your message…"
                />
              </div>

              {/* Sender name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Your name <span className="text-muted-foreground font-normal">(signature)</span>
                </Label>
                <Input
                  value={emailSenderName}
                  onChange={(e) => setEmailSenderName(e.target.value)}
                  placeholder="e.g. Luis — leave blank for 'The LV Branding Team'"
                />
              </div>

              {/* Link note */}
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2.5 text-xs text-rose-700">
                <ExternalLink size={11} className="shrink-0 mt-0.5" />
                <span>
                  A <strong>"Complete Your Brief →"</strong> button with the personalized intake link is added automatically.
                </span>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowEmailPreview(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={sendEmail}
                  disabled={sendingEmail || !emailSubject.trim() || !emailMessage.trim() || !pickedContact?.email}
                  className="gap-1.5 bg-rose-500 hover:bg-rose-600 text-white"
                >
                  {sendingEmail
                    ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                    : <><Send size={13} /> Send Email</>
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}
