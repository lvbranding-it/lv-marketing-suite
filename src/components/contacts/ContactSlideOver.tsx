import { useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { X, ExternalLink, Mail, Phone, Linkedin, Globe, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type ImportedContact } from "@/hooks/useContacts";
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

interface Props {
  contact: ImportedContact | null;
  onClose: () => void;
  onUpdate?: () => void;
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
    <span className={cn("text-[10px] border px-1.5 py-0.5 rounded-full font-medium", cls)}>
      {score}% fit
    </span>
  );
}

export default function ContactSlideOver({ contact, onClose, onUpdate }: Props) {
  const updateStage = useUpdatePipelineStage();
  const updateCRM = useUpdateContactCRM();
  const addActivity = useAddActivity();
  const deleteActivity = useDeleteActivity();

  const { data: activities = [], isLoading: activitiesLoading } = useContactActivities(contact?.id ?? null);

  // Local state for edits
  const [dealValue, setDealValue] = useState<string>("");
  const [dealProb, setDealProb] = useState<string>("");
  const [crmNotes, setCrmNotes] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [followupDate, setFollowupDate] = useState<string>("");

  // Activity form state
  const [activityType, setActivityType] = useState<"note" | "call" | "email" | "meeting">("note");
  const [activityBody, setActivityBody] = useState("");

  // Track which contact we've initialized state for
  const initializedContactId = useRef<string | null>(null);

  // Sync local state when contact changes
  if (contact && contact.id !== initializedContactId.current) {
    initializedContactId.current = contact.id;
    setDealValue(contact.deal_value != null ? String(contact.deal_value) : "");
    setDealProb(contact.deal_probability != null ? String(contact.deal_probability) : "");
    setCrmNotes(contact.crm_notes ?? "");
    setTags(contact.tags ?? []);
    setFollowupDate(
      contact.next_followup_at
        ? contact.next_followup_at.substring(0, 10)
        : ""
    );
  }

  if (!contact) return null;

  const stage = PIPELINE_STAGES.find((s) => s.key === contact.pipeline_stage) ?? PIPELINE_STAGES[0];
  const initials = getInitials(contact.first_name, contact.last_name);
  const avatarBg = getInitialsBg(contact.first_name ?? contact.last_name ?? "A");

  const handleStageChange = (val: string) => {
    updateStage.mutate({ id: contact.id, pipeline_stage: val as PipelineStage });
    onUpdate?.();
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
    onUpdate?.();
  };

  const removeTag = (t: string) => {
    const newTags = tags.filter((x) => x !== t);
    setTags(newTags);
    updateCRM.mutate({ id: contact.id, tags: newTags });
    onUpdate?.();
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    }
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
        className="w-full sm:max-w-[520px] p-0 flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className={cn(
                "w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0",
                avatarBg
              )}
            >
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold leading-tight truncate">
                  {contact.first_name} {contact.last_name}
                </h2>
                <FitBadge score={contact.fit_score} />
                <Badge variant="outline" className="text-[9px]">
                  {contact.source}
                </Badge>
              </div>
              {contact.title && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{contact.title}</p>
              )}
              {contact.company && (
                <p className="text-xs text-sky-500 font-medium truncate">{contact.company}</p>
              )}

              {/* Pipeline stage selector */}
              <div className="mt-2">
                <Select
                  value={contact.pipeline_stage ?? "lead"}
                  onValueChange={handleStageChange}
                >
                  <SelectTrigger className="h-7 text-xs w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        <span className={cn("flex items-center gap-1.5 text-xs", s.color)}>
                          <span>{s.emoji}</span>
                          <span>{s.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity p-1"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-5 mt-3 mb-0 self-start">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
              <TabsTrigger value="followup" className="text-xs">Follow-up</TabsTrigger>
            </TabsList>

            {/* ── Overview Tab ── */}
            <TabsContent
              value="overview"
              className="flex-1 overflow-y-auto px-5 py-4 space-y-5 mt-0"
            >
              {/* Contact Info */}
              <Section title="Contact Info">
                <InfoRow icon={<Mail size={12} />} label="Email">
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-primary hover:underline text-xs truncate"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </InfoRow>
                <InfoRow icon={<Phone size={12} />} label="Phone">
                  {contact.phone ? (
                    <span className="text-xs">{contact.phone}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </InfoRow>
                {contact.linkedin_url && (
                  <InfoRow icon={<Linkedin size={12} />} label="LinkedIn">
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs flex items-center gap-1"
                    >
                      Profile <ExternalLink size={10} />
                    </a>
                  </InfoRow>
                )}
                {contact.website && (
                  <InfoRow icon={<Globe size={12} />} label="Website">
                    <a
                      href={contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs flex items-center gap-1 truncate max-w-[200px]"
                    >
                      {contact.website} <ExternalLink size={10} />
                    </a>
                  </InfoRow>
                )}
                {(contact.city || contact.state) && (
                  <InfoRow icon={null} label="Location">
                    <span className="text-xs">{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
                  </InfoRow>
                )}
                {contact.industry && (
                  <InfoRow icon={null} label="Industry">
                    <span className="text-xs">{contact.industry}</span>
                  </InfoRow>
                )}
                {contact.employees_range && (
                  <InfoRow icon={null} label="Employees">
                    <span className="text-xs">{contact.employees_range}</span>
                  </InfoRow>
                )}
              </Section>

              {/* Deal Info */}
              <Section title="Deal Info">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground w-28 shrink-0">Deal Value</label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        className="h-7 text-xs w-28"
                        placeholder="0.00"
                        value={dealValue}
                        onChange={(e) => setDealValue(e.target.value)}
                        onBlur={saveDeal}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground w-28 shrink-0">Probability</label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-7 text-xs w-20"
                        placeholder="0-100"
                        min={0}
                        max={100}
                        value={dealProb}
                        onChange={(e) => setDealProb(e.target.value)}
                        onBlur={saveDeal}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  {contact.last_contacted_at && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-muted-foreground w-28 shrink-0">Last Contacted</label>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(contact.last_contacted_at), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground w-28 shrink-0">Next Follow-up</label>
                    <Input
                      type="date"
                      className="h-7 text-xs w-36"
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
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full"
                    >
                      {t}
                      <button
                        onClick={() => removeTag(t)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  className="h-7 text-xs"
                  placeholder="Add tag, press Enter or comma…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => {
                    if (tagInput.trim()) {
                      addTag(tagInput);
                      setTagInput("");
                    }
                  }}
                />
              </Section>

              {/* Notes */}
              <Section title="Notes">
                <textarea
                  className="w-full text-xs border border-border rounded-md p-2.5 bg-background resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
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
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4 mt-0"
            >
              {/* Quick add form */}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex gap-1.5">
                  {ACTIVITY_META.map((m) => (
                    <button
                      key={m.type}
                      onClick={() => setActivityType(m.type as "note" | "call" | "email" | "meeting")}
                      className={cn(
                        "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-medium transition-colors",
                        activityType === m.type
                          ? cn(m.bg, m.color, "border-current")
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      )}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full text-xs border border-border rounded-md p-2.5 bg-background resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={activityPlaceholders[activityType]}
                  value={activityBody}
                  onChange={(e) => setActivityBody(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleLogActivity}
                  disabled={addActivity.isPending || !activityBody.trim()}
                >
                  {addActivity.isPending ? "Logging…" : "Log"}
                </Button>
              </div>

              {/* Activity timeline */}
              {activitiesLoading ? (
                <p className="text-xs text-muted-foreground">Loading activities…</p>
              ) : activities.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Log your first interaction above.</p>
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
                            "w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0",
                            meta.bg
                          )}
                        >
                          {meta.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn("text-[10px] font-semibold", meta.color)}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 whitespace-pre-wrap">{a.body}</p>
                        </div>
                        <button
                          onClick={() =>
                            deleteActivity.mutate({ id: a.id, contact_id: contact.id })
                          }
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={12} />
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
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4 mt-0"
            >
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                    Follow-up Date
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="h-8 text-sm w-44"
                      value={followupDate}
                      onChange={(e) => {
                        setFollowupDate(e.target.value);
                        saveFollowup(e.target.value ? new Date(e.target.value).toISOString() : null);
                      }}
                    />
                    {isOverdue && (
                      <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick set buttons */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Quick Set</p>
                  <div className="flex flex-wrap gap-2">
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
                        className="h-7 text-xs"
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
                    className="h-7 text-xs text-destructive hover:text-destructive"
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
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
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
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
