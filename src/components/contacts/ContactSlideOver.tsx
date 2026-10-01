import { useState, useRef, useLayoutEffect, useEffect, type TextareaHTMLAttributes } from "react";
import { formatDistanceToNow } from "date-fns";
import { X, ExternalLink, Mail, Phone, Linkedin, Globe, Trash2, Sparkles, Loader2, CheckCircle2, XCircle, AlertCircle, ShieldCheck, Tag, Plus } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MarkdownContent } from "@/components/ui/markdown-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { runSkillStream } from "@/lib/claude";
import { useToast } from "@/hooks/use-toast";
import { type ImportedContact } from "@/hooks/useContacts";
import {
  verifyContact,
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  type VerifyResult,
} from "@/lib/contactResearch";
import {
  PIPELINE_STAGES,
  ACTIVITY_META,
  useUpdatePipelineStage,
  useUpdateContactCRM,
  useContactActivities,
  useAddActivity,
  useDeleteActivity,
  type PipelineStage,
} from "@/hooks/useCRM";
import { useContactTagDefinitions, useCreateTagDefinition, pickTagColor } from "@/hooks/useContactTags";

interface Props {
  contact: ImportedContact | null;
  onClose: () => void;
  onUpdate?: (updates?: Partial<ImportedContact>) => void;
}

function getInitials(first: string | null, last: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function getInitialsBg(name: string) {
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-sky-500", "bg-pink-500", "bg-indigo-500", "bg-teal-500",
  ];
  const idx = (name.charCodeAt(0) ?? 0) % colors.length;
  return colors[idx];
}

function FitBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const cls =
    score >= 85
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : score >= 70
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={cn("text-xs border px-1.5 py-0.5 rounded-full font-medium", cls)}>
      {score}% fit
    </span>
  );
}

interface TagPickerProps {
  tagDefs: { id: string; name: string; color: string }[];
  currentTags: string[];
  tagColorMap: Map<string, string>;
  onAdd: (name: string) => void;
  onCreateAndAdd: (name: string, color: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  pickColor: () => string;
}

function TagPickerPopover({ tagDefs, currentTags, tagColorMap, onAdd, onCreateAndAdd, tagInput, setTagInput, pickColor }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const query = tagInput.trim().toLowerCase();

  const available = tagDefs.filter(
    (d) => !currentTags.includes(d.name) && (!query || d.name.toLowerCase().includes(query))
  );
  const exactMatch = tagDefs.some((d) => d.name.toLowerCase() === query);
  const canCreate = query.length > 0 && !exactMatch;

  const handleSelect = (name: string) => {
    onAdd(name);
    setTagInput("");
    setOpen(false);
  };

  const handleCreate = () => {
    if (!query) return;
    const name = tagInput.trim();
    onCreateAndAdd(name, pickColor());
    setTagInput("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus size={11} /> Add tag
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 space-y-1.5" align="start" side="bottom">
        <input
          autoFocus
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (available[0]) handleSelect(available[0].name);
              else if (canCreate) handleCreate();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search or create…"
          className="w-full h-9 text-sm bg-muted/50 border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="max-h-44 overflow-y-auto space-y-0.5">
          {available.map((d) => (
            <button
              key={d.id}
              onClick={() => handleSelect(d.name)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              {d.name}
            </button>
          ))}
          {available.length === 0 && !canCreate && (
            <p className="text-[11px] text-muted-foreground text-center py-2">
              {currentTags.length === tagDefs.length ? "All tags already applied" : "No tags found"}
            </p>
          )}
          {canCreate && (
            <button
              onClick={handleCreate}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left text-primary"
            >
              <Tag size={10} className="shrink-0" />
              Create <strong className="ml-0.5">"{tagInput.trim()}"</strong>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ContactSlideOver({ contact, onClose, onUpdate }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateStage = useUpdatePipelineStage();
  const updateCRM = useUpdateContactCRM();
  const addActivity = useAddActivity();
  const deleteActivity = useDeleteActivity();
  const { data: tagDefs = [] } = useContactTagDefinitions();
  const createTagDef = useCreateTagDefinition();

  const tagColorMap = new Map(tagDefs.map((d) => [d.name, d.color]));

  const { data: activities = [], isLoading: activitiesLoading } = useContactActivities(contact?.id ?? null);

  // Local state for edits
  const [dealValue, setDealValue] = useState<string>("");
  const [dealProb, setDealProb] = useState<string>("");
  const [crmNotes, setCrmNotes] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [stageValue, setStageValue] = useState<PipelineStage>("lead");

  // Must be declared after `tags` state to avoid Rolldown TDZ ordering issue
  const tagSuggestions = tagDefs.map((d) => d.name).filter((n) => !tags.includes(n));
  const [followupDate, setFollowupDate] = useState<string>("");

  // Activity form state
  const [activityType, setActivityType] = useState<"note" | "call" | "email" | "meeting">("note");
  const [activityBody, setActivityBody] = useState("");

  // Research state
  const [researchText, setResearchText] = useState<string>("");
  const [researchStreaming, setResearchStreaming] = useState(false);
  const [researchVerifying, setResearchVerifying] = useState(false);
  const [verification, setVerification] = useState<VerifyResult | null>(null);

  // Track which contact we've initialized state for
  const initializedContactId = useRef<string | null>(null);

  // Sync local state when contact changes
  if (contact && contact.id !== initializedContactId.current) {
    initializedContactId.current = contact.id;
    setDealValue(contact.deal_value != null ? String(contact.deal_value) : "");
    setDealProb(contact.deal_probability != null ? String(contact.deal_probability) : "");
    setCrmNotes(contact.crm_notes ?? "");
    setTags(contact.tags ?? []);
    setStageValue(contact.pipeline_stage ?? "lead");
    setResearchText(contact.research_result ?? "");
    setVerification(null);
    setResearchVerifying(false);
    setResearchStreaming(false);
    setFollowupDate(
      contact.next_followup_at
        ? contact.next_followup_at.substring(0, 10)
        : ""
    );
  }

  const runResearch = async () => {
    if (!contact) return;
    setResearchText("");
    setVerification(null);

    // Step 1 — real HTTP checks
    setResearchVerifying(true);
    const vr = await verifyContact(contact);
    setVerification(vr);
    setResearchVerifying(false);

    // Step 2 — stream Claude analysis grounded in real verification data
    setResearchStreaming(true);
    await runSkillStream(
      {
        orgId: contact.org_id,
        branchId: contact.branch_id,
        skillSystemPrompt: RESEARCH_SYSTEM_PROMPT,
        userMessage: buildResearchPrompt(contact, vr),
        conversationHistory: [],
        marketingContext: {},
      },
      {
        onToken: (t) => setResearchText((prev) => prev + t),
        onComplete: async (text) => {
          await supabase
            .from("contacts")
            .update({ research_result: text })
            .eq("id", contact.id);
          qc.invalidateQueries({ queryKey: ["contacts"] });
          setResearchStreaming(false);
          onUpdate?.();
        },
        onError: (err) => {
          toast({ variant: "destructive", description: err.message });
          setResearchStreaming(false);
        },
      }
    );
  };

  if (!contact) return null;

  const initials = getInitials(contact.first_name, contact.last_name);
  const avatarBg = getInitialsBg(contact.first_name ?? contact.last_name ?? "A");

  const handleStageChange = (val: string) => {
    const nextStage = val as PipelineStage;
    const previousStage = stageValue;

    setStageValue(nextStage);
    onUpdate?.({ pipeline_stage: nextStage });

    updateStage.mutate(
      { id: contact.id, pipeline_stage: nextStage },
      {
        onError: (error) => {
          setStageValue(previousStage);
          onUpdate?.({ pipeline_stage: previousStage });
          toast({
            variant: "destructive",
            description: error instanceof Error ? error.message : "Could not update contact status.",
          });
        },
      }
    );
  };

  const saveDeal = () => {
    updateCRM.mutate({
      id: contact.id,
      deal_value: dealValue !== "" ? parseFloat(dealValue) : null,
      deal_probability: dealProb !== "" ? parseInt(dealProb, 10) : null,
    });
    onUpdate?.();
  };

  const saveNotes = () => {
    updateCRM.mutate({ id: contact.id, crm_notes: crmNotes });
    onUpdate?.();
  };

  const addTag = (val: string) => {
    const trimmed = val.trim().replace(/,/g, "");
    if (!trimmed || tags.includes(trimmed)) return;
    const newTags = [...tags, trimmed];
    setTags(newTags);
    updateCRM.mutate({ id: contact.id, tags: newTags });
    // Auto-create a tag definition if it doesn't exist yet
    if (!tagColorMap.has(trimmed)) {
      createTagDef.mutate({ name: trimmed, color: pickTagColor(tagDefs.map((d) => d.color)) });
    }
    onUpdate?.();
  };

  const removeTag = (t: string) => {
    const newTags = tags.filter((x) => x !== t);
    setTags(newTags);
    updateCRM.mutate({ id: contact.id, tags: newTags });
    onUpdate?.();
  };

  const saveFollowup = (date: string | null) => {
    updateCRM.mutate({ id: contact.id, next_followup_at: date });
    onUpdate?.();
  };

  const handleLogActivity = async () => {
    if (!activityBody.trim()) return;
    await addActivity.mutateAsync({
      contact_id: contact.id,
      type: activityType,
      body: activityBody.trim(),
    });
    setActivityBody("");
    onUpdate?.();
  };

  const isOverdue =
    contact.next_followup_at && new Date(contact.next_followup_at) < new Date();

  const activityPlaceholders: Record<string, string> = {
    note: "Add a note about this contact…",
    call: "What was discussed on the call?",
    email: "Summarize the email exchange…",
    meeting: "What happened in the meeting?",
  };

  return (
    <Sheet open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[600px] lg:max-w-[720px] max-h-[100dvh] p-0 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className={cn(
                "w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0",
                avatarBg
              )}
            >
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold leading-tight truncate">
                  {contact.first_name} {contact.last_name}
                </h2>
                <FitBadge score={contact.fit_score} />
                <Badge variant="outline" className="text-[11px]">
                  {contact.source}
                </Badge>
              </div>
              {contact.title && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{contact.title}</p>
              )}
              {contact.company && (
                <p className="text-sm text-sky-500 font-medium truncate">{contact.company}</p>
              )}

              {/* Pipeline stage selector */}
              <div className="mt-2">
                <Select
                  value={stageValue}
                  onValueChange={handleStageChange}
                >
                  <SelectTrigger className="h-9 text-sm w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        <span className={cn("flex items-center gap-1.5 text-sm", s.color)}>
                          <s.icon size={13} aria-hidden />
                          <span>{s.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 sm:mx-6 mt-3 mb-0 self-start">
              <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
              <TabsTrigger value="activity" className="text-sm">Activity</TabsTrigger>
              <TabsTrigger value="followup" className="text-sm">Follow-up</TabsTrigger>
              <TabsTrigger value="research" className="text-sm flex items-center gap-1">
                <Sparkles size={10} />
                Research
                {researchText && !researchStreaming && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Overview Tab ── */}
            <TabsContent
              value="overview"
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-5 mt-0"
            >
              {/* Contact Info */}
              <Section title="Contact Info">
                <InfoRow icon={<Mail size={14} />} label="Email">
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-primary hover:underline text-sm truncate"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </InfoRow>
                <InfoRow icon={<Phone size={14} />} label="Phone">
                  {contact.phone ? (
                    <span className="text-sm">{contact.phone}</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </InfoRow>
                {contact.linkedin_url && (
                  <InfoRow icon={<Linkedin size={14} />} label="LinkedIn">
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm flex items-center gap-1"
                    >
                      Profile <ExternalLink size={10} />
                    </a>
                  </InfoRow>
                )}
                {contact.website && (
                  <InfoRow icon={<Globe size={14} />} label="Website">
                    <a
                      href={contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm flex items-center gap-1 truncate max-w-[320px]"
                    >
                      {contact.website} <ExternalLink size={10} />
                    </a>
                  </InfoRow>
                )}
                {(contact.city || contact.state) && (
                  <InfoRow icon={null} label="Location">
                    <span className="text-sm">{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
                  </InfoRow>
                )}
                {contact.industry && (
                  <InfoRow icon={null} label="Industry">
                    <span className="text-sm">{contact.industry}</span>
                  </InfoRow>
                )}
                {contact.employees_range && (
                  <InfoRow icon={null} label="Employees">
                    <span className="text-sm">{contact.employees_range}</span>
                  </InfoRow>
                )}
              </Section>

              {/* Deal Info */}
              <Section title="Deal Info">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-32 shrink-0">Deal Value</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input
                        type="number"
                        className="h-9 text-sm w-full sm:w-36"
                        placeholder="0.00"
                        value={dealValue}
                        onChange={(e) => setDealValue(e.target.value)}
                        onBlur={saveDeal}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-32 shrink-0">Probability</label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-9 text-sm w-24"
                        placeholder="0-100"
                        min={0}
                        max={100}
                        value={dealProb}
                        onChange={(e) => setDealProb(e.target.value)}
                        onBlur={saveDeal}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  {contact.last_contacted_at && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground w-32 shrink-0">Last Contacted</label>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(contact.last_contacted_at), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-32 shrink-0">Next Follow-up</label>
                    <Input
                      type="date"
                      className="h-9 text-sm w-full sm:w-44"
                      value={followupDate}
                      onChange={(e) => {
                        setFollowupDate(e.target.value);
                        saveFollowup(e.target.value ? new Date(e.target.value).toISOString() : null);
                      }}
                    />
                  </div>
                </div>
              </Section>

              {/* Tags */}
              <Section title="Tags">
                {tags.length === 0 && (
                  <p className="text-xs text-muted-foreground mb-1.5">
                    No tags yet — click <strong>Add tag</strong> below to assign one.
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const color = tagColorMap.get(t) ?? "#6366f1";
                    return (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium text-white"
                        style={{ background: color }}
                      >
                        {t}
                        <button
                          onClick={() => removeTag(t)}
                          className="opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                  <TagPickerPopover
                    tagDefs={tagDefs}
                    currentTags={tags}
                    tagColorMap={tagColorMap}
                    onAdd={(name) => { addTag(name); setTagInput(""); }}
                    onCreateAndAdd={(name, color) => {
                      createTagDef.mutate({ name, color });
                      addTag(name);
                      setTagInput("");
                    }}
                    tagInput={tagInput}
                    setTagInput={setTagInput}
                    pickColor={() => pickTagColor(tagDefs.map((d) => d.color))}
                  />
                </div>
              </Section>

              {/* Notes */}
              <Section title="Notes">
                <AutoGrowTextarea
                  className="min-h-[140px] p-3 leading-relaxed"
                  placeholder="Add notes about this contact…"
                  value={crmNotes}
                  onChange={(e) => setCrmNotes(e.target.value)}
                  onBlur={saveNotes}
                />
              </Section>
            </TabsContent>

            {/* ── Activity Tab ── */}
            <TabsContent
              value="activity"
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-5 mt-0"
            >
              {/* Quick add form */}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex gap-1 sm:gap-1.5 flex-wrap">
                  {ACTIVITY_META.map((m) => (
                    <button
                      key={m.type}
                      onClick={() => setActivityType(m.type as "note" | "call" | "email" | "meeting")}
                      className={cn(
                        "flex items-center gap-1 text-xs px-2 py-1 rounded-md border font-medium transition-colors",
                        activityType === m.type
                          ? cn(m.bg, m.color, "border-current")
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      )}
                    >
                      <m.icon size={12} aria-hidden />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
                <AutoGrowTextarea
                  className="min-h-[88px] p-2.5"
                  placeholder={activityPlaceholders[activityType]}
                  value={activityBody}
                  onChange={(e) => setActivityBody(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-9 text-sm"
                  onClick={handleLogActivity}
                  disabled={addActivity.isPending || !activityBody.trim()}
                >
                  {addActivity.isPending ? "Logging…" : "Log"}
                </Button>
              </div>

              {/* Activity timeline */}
              {activitiesLoading ? (
                <p className="text-sm text-muted-foreground">Loading activities…</p>
              ) : activities.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Log your first interaction above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activities.map((a) => {
                    const meta = ACTIVITY_META.find((m) => m.type === a.type) ?? ACTIVITY_META[0];
                    return (
                      <div
                        key={a.id}
                        className="border border-border rounded-lg p-3 flex items-start gap-3 bg-card"
                      >
                        <span
                          className={cn(
                            "w-7 h-9 rounded-full flex items-center justify-center text-sm shrink-0",
                            meta.bg
                          )}
                        >
                          <meta.icon size={13} className={meta.color} aria-hidden />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn("text-xs font-semibold", meta.color)}>
                              {meta.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{a.body}</p>
                        </div>
                        <button
                          onClick={() =>
                            deleteActivity.mutate({ id: a.id, contact_id: contact.id })
                          }
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Follow-up Tab ── */}
            <TabsContent
              value="followup"
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-5 mt-0"
            >
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">
                    Follow-up Date
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="h-8 text-sm w-full sm:w-44"
                      value={followupDate}
                      onChange={(e) => {
                        setFollowupDate(e.target.value);
                        saveFollowup(e.target.value ? new Date(e.target.value).toISOString() : null);
                      }}
                    />
                    {isOverdue && (
                      <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick set buttons */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Quick Set</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Tomorrow", days: 1 },
                      { label: "In 3 days", days: 3 },
                      { label: "Next week", days: 7 },
                      { label: "Next month", days: 30 },
                    ].map(({ label, days }) => (
                      <Button
                        key={label}
                        variant="outline"
                        size="sm"
                        className="h-9 text-sm flex-1 sm:flex-auto"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + days);
                          const iso = d.toISOString();
                          const dateStr = iso.substring(0, 10);
                          setFollowupDate(dateStr);
                          saveFollowup(iso);
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {followupDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-sm text-destructive hover:text-destructive"
                    onClick={() => {
                      setFollowupDate("");
                      saveFollowup(null);
                    }}
                  >
                    Clear follow-up
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* ── Research Tab ── */}
            <TabsContent
              value="research"
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-5 mt-0"
            >
              {/* Action button */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={runResearch}
                  disabled={researchVerifying || researchStreaming}
                  className="gap-2 w-full sm:w-auto"
                  size="sm"
                >
                  {researchVerifying ? (
                    <><Loader2 size={13} className="animate-spin" />Checking links…</>
                  ) : researchStreaming ? (
                    <><Loader2 size={13} className="animate-spin" />Analyzing…</>
                  ) : researchText ? (
                    <><Sparkles size={13} />Re-research</>
                  ) : (
                    <><Sparkles size={13} />Research with AI</>
                  )}
                </Button>
                {researchText && !researchVerifying && !researchStreaming && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Analysis ready
                  </span>
                )}
              </div>

              {/* Verification pills — shown after HTTP checks run */}
              {verification && (
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Pre-verification checks
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <VerifyPillInline
                      label="Website"
                      live={verification.website.live}
                      detail={
                        verification.website.live
                          ? `HTTP ${verification.website.status}`
                          : (verification.website.error ?? "no response")
                      }
                    />
                    <VerifyPillInline
                      label="Email domain"
                      live={verification.email.mx_valid}
                      detail={verification.email.domain ?? "—"}
                    />
                    <VerifyPillInline
                      label="LinkedIn"
                      live={
                        !verification.linkedin.url
                          ? null
                          : verification.linkedin.format_valid
                      }
                      detail={
                        verification.linkedin.username ??
                        (verification.linkedin.url ? "bad URL" : "not provided")
                      }
                    />
                  </div>
                </div>
              )}

              {/* Result */}
              {researchText ? (
                <div className="bg-muted/40 border border-border rounded-lg p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <ShieldCheck size={12} className="text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                      AI Research — verified data
                    </span>
                    {researchStreaming && (
                      <Loader2 size={10} className="animate-spin text-muted-foreground ml-1" />
                    )}
                  </div>
                  <MarkdownContent>{researchText}</MarkdownContent>
                  {researchStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle mt-1" />
                  )}
                </div>
              ) : !researchVerifying && !researchStreaming ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles size={22} className="text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No research yet</p>
                  <p className="text-sm text-muted-foreground max-w-[240px]">
                    Runs real HTTP checks on the website, email domain, and LinkedIn before asking AI to assess this contact.
                  </p>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VerifyPillInline({
  label,
  live,
  detail,
}: {
  label: string;
  live: boolean | null;
  detail: string;
}) {
  if (live === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
        <AlertCircle size={11} />
        {label}: {detail}
      </span>
    );
  }
  return live ? (
    <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} />
      {label}: {detail}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle size={11} />
      {label}: {detail}
    </span>
  );
}

/**
 * A text box as tall as what it holds.
 *
 * Notes were an 80px box with resizing switched off, so a lead's enquiry —
 * often nineteen lines — showed four and cut the rest mid-sentence while the
 * panel below sat empty. The box now grows with its content and the panel
 * scrolls, so the whole note reads in one place instead of in a keyhole.
 */
function AutoGrowTextarea({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight leaves out the border, which border-box sizing counts.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  };

  useLayoutEffect(fit, [value]);
  // Wrapping, and so height, changes when the panel changes width.
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      className={cn(
        "block w-full resize-none overflow-hidden rounded-md border border-border bg-background text-sm",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground w-4 shrink-0">{icon}</span>}
      {!icon && <span className="w-4 shrink-0" />}
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
