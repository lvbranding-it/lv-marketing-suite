import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader2, Copy, Check, QrCode, ExternalLink, Download, Trash2, Upload } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/useOrg";
import { useEvent, useCreateEvent, useUpdateEvent, type LVEvent } from "@/hooks/useEvents";
import { supabase } from "@/integrations/supabase/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

// ── QR Panel ─────────────────────────────────────────────────────────────────

function QRPanel({ slug }: { slug: string }) {
  const uploadUrl = `${window.location.origin}/event/${slug}/upload`;
  const liveUrl   = `${window.location.origin}/event/${slug}/live-screen`;
  const qrSrc     = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&format=png&data=${encodeURIComponent(uploadUrl)}`;

  const handleDownloadQR = async () => {
    const res  = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(uploadUrl)}`);
    const blob = await res.blob();
    const a    = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${slug}-qr.png` });
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4 sticky top-4">
      <p className="text-sm font-semibold">QR Code & Links</p>

      {/* QR image */}
      <div className="flex justify-center">
        <div className="p-3 bg-white border border-border rounded-xl">
          <img src={qrSrc} alt="QR Code" className="w-36 h-36" />
        </div>
      </div>

      <Button variant="outline" className="w-full gap-2 text-xs h-8" onClick={handleDownloadQR}>
        <Download size={12} /> Download QR Code (PNG)
      </Button>

      {/* Upload URL */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upload URL</p>
        <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-md px-2 py-1.5">
          <code className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">{uploadUrl}</code>
          <CopyButton text={uploadUrl} />
          <a href={uploadUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-primary">
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Live Screen URL */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Screen URL</p>
        <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-md px-2 py-1.5">
          <code className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">{liveUrl}</code>
          <CopyButton text={liveUrl} />
          <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-primary">
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS: Partial<LVEvent> = {
  status:                    "draft",
  primary_color:             "#0B1F4D",
  secondary_color:           "#CB2039",
  accent_color:              "#FFFFFF",
  theme:                     "default",
  upload_headline:           "Share Your Moment!",
  require_caption:           false,
  require_name:              false,
  require_consent:           true,
  auto_approve:              false,
  allow_camera_capture:      true,
  allow_gallery_upload:      true,
  camera_mode:               "both",
  selfie_button_label:       "Take a Selfie",
  rear_camera_button_label:  "Take Event Photo",
  gallery_button_label:      "Upload From Gallery",
  slideshow_interval_seconds: 7,
  show_captions:             true,
  show_names:                false,
  show_sponsors:             true,
  show_logo:                 true,
  show_qr_code_on_screen:    true,
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function EventExperienceEditor() {
  const navigate        = useNavigate();
  const { eventId }     = useParams<{ eventId: string }>();
  const isNew           = !eventId || eventId === "new";
  const { org }         = useOrg();
  const { toast }       = useToast();
  const logoInputRef    = useRef<HTMLInputElement>(null);
  const createEvent     = useCreateEvent();
  const updateEvent     = useUpdateEvent();
  const { data: existing, isLoading } = useEvent(isNew ? undefined : eventId);

  const [form, setForm] = useState<Partial<LVEvent>>(DEFAULTS);
  const [slugManual, setSlugManual] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);

  const set = <K extends keyof LVEvent>(key: K, value: LVEvent[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleNameChange = (name: string) => {
    set("name", name);
    if (!slugManual) set("slug", slugify(name));
  };

  const handleLogoUpload = async (file: File) => {
    if (!org) return;
    setUploadingLogo(true);
    try {
      const ext  = file.name.split(".").pop() ?? "png";
      const path = `${org.id}/${form.id ?? "new"}/logo.${ext}`;
      const { error } = await supabase.storage.from("event-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/event-assets/${path}`;
      set("logo_url", url);
    } catch {
      toast({ variant: "destructive", description: "Failed to upload logo." });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.slug?.trim()) {
      toast({ variant: "destructive", description: "Event name and slug are required." });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createEvent.mutateAsync(form);
        toast({ description: "Event created!" });
        navigate(`/event-experiences/${created.id}`);
      } else {
        await updateEvent.mutateAsync({ id: eventId!, ...form });
        toast({ description: "Event saved." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save event.";
      toast({ variant: "destructive", description: msg });
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && isLoading) {
    return (
      <AppShell>
        <Header title="Event Editor" />
        <div className="p-6 max-w-5xl mx-auto space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </AppShell>
    );
  }

  const slug = form.slug ?? "";

  return (
    <AppShell>
      <Header
        title={isNew ? "New Event" : form.name ?? "Edit Event"}
        subtitle={isNew ? "Create a new live event experience" : `/${slug}/upload`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/event-experiences")}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving…" : "Save Event"}
            </Button>
          </div>
        }
      />

      <div className="p-3 sm:p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="basics">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="basics" className="flex-1">Basics</TabsTrigger>
                <TabsTrigger value="content" className="flex-1">Content</TabsTrigger>
                <TabsTrigger value="branding" className="flex-1">Branding</TabsTrigger>
                <TabsTrigger value="settings" className="flex-1">Settings</TabsTrigger>
              </TabsList>

              {/* ── BASICS ── */}
              <TabsContent value="basics" className="space-y-4">
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <FormField label="Event Name" required>
                    <Input value={form.name ?? ""} onChange={(e) => handleNameChange(e.target.value)} placeholder="4th of July Celebration" />
                  </FormField>
                  <FormField label="URL Slug" hint="Used in the public URL. Letters, numbers, and hyphens only." required>
                    <Input
                      value={form.slug ?? ""}
                      onChange={(e) => { setSlugManual(true); set("slug", slugify(e.target.value)); }}
                      placeholder="4th-of-july-celebration"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Status">
                      <select
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={form.status ?? "draft"}
                        onChange={(e) => set("status", e.target.value as LVEvent["status"])}
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                      </select>
                    </FormField>
                    <FormField label="Event Date">
                      <Input type="date" value={form.event_date ?? ""} onChange={(e) => set("event_date", e.target.value || null)} />
                    </FormField>
                  </div>
                  <FormField label="Venue Name">
                    <Input value={form.venue_name ?? ""} onChange={(e) => set("venue_name", e.target.value || null)} placeholder="Community Event Venue" />
                  </FormField>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="City">
                      <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value || null)} placeholder="Miami" />
                    </FormField>
                    <FormField label="State">
                      <Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value || null)} placeholder="FL" />
                    </FormField>
                  </div>
                </div>
              </TabsContent>

              {/* ── CONTENT ── */}
              <TabsContent value="content" className="space-y-4">
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Upload Page</p>
                  <FormField label="Upload Headline" required>
                    <Input value={form.upload_headline ?? ""} onChange={(e) => set("upload_headline", e.target.value)} placeholder="Show Us Your 4th!" />
                  </FormField>
                  <FormField label="Upload Subheadline">
                    <Textarea rows={2} value={form.upload_subheadline ?? ""} onChange={(e) => set("upload_subheadline", e.target.value || null)} placeholder="Take a photo or upload your favorite moment from tonight…" />
                  </FormField>
                  <FormField label="Confirmation Message" hint="Shown after the attendee submits.">
                    <Textarea rows={2} value={form.confirmation_message ?? ""} onChange={(e) => set("confirmation_message", e.target.value || null)} placeholder="Thank you! Your photo was received." />
                  </FormField>
                </div>

                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Live Screen</p>
                  <FormField label="Screen Headline">
                    <Input value={form.screen_headline ?? ""} onChange={(e) => set("screen_headline", e.target.value || null)} placeholder="4th of July Celebration" />
                  </FormField>
                  <FormField label="Screen Subheadline">
                    <Input value={form.screen_subheadline ?? ""} onChange={(e) => set("screen_subheadline", e.target.value || null)} placeholder="Community · Freedom · Celebration" />
                  </FormField>
                  <FormField label="Lower Third Text">
                    <Input value={form.lower_third_text ?? ""} onChange={(e) => set("lower_third_text", e.target.value || null)} placeholder="Live Event Experience by LV Branding" />
                  </FormField>
                  <FormField label="Sponsor Message">
                    <Input value={form.sponsor_message ?? ""} onChange={(e) => set("sponsor_message", e.target.value || null)} placeholder="Presented by our community partners" />
                  </FormField>
                </div>
              </TabsContent>

              {/* ── BRANDING ── */}
              <TabsContent value="branding" className="space-y-4">
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Logo</p>
                  <div className="flex items-center gap-4">
                    {form.logo_url ? (
                      <div className="relative">
                        <img src={form.logo_url} alt="Logo" className="w-20 h-20 object-contain border border-border rounded-xl bg-white p-2" />
                        <button onClick={() => set("logo_url", null)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex items-center justify-center text-muted-foreground">
                        <Upload size={20} />
                      </div>
                    )}
                    <div>
                      <Button variant="outline" size="sm" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                        {uploadingLogo ? <><Loader2 size={12} className="animate-spin mr-1" /> Uploading…</> : "Upload Logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">PNG or SVG recommended</p>
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colors</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Primary Color", key: "primary_color" as const },
                      { label: "Secondary Color", key: "secondary_color" as const },
                      { label: "Accent Color", key: "accent_color" as const },
                    ].map(({ label, key }) => (
                      <FormField key={key} label={label}>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={form[key] ?? "#000000"}
                            onChange={(e) => set(key, e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer border border-input"
                          />
                          <Input
                            value={form[key] ?? ""}
                            onChange={(e) => set(key, e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>
                      </FormField>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Theme</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["default", "patriotic", "premium", "custom"].map((t) => (
                      <button
                        key={t}
                        onClick={() => set("theme", t)}
                        className={`px-3 py-2 rounded-lg text-sm border transition-colors capitalize ${
                          form.theme === t
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-foreground/30"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── SETTINGS ── */}
              <TabsContent value="settings" className="space-y-4">
                {/* Camera */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Camera & Upload</p>
                  <ToggleRow label="Allow camera capture" checked={form.allow_camera_capture ?? true} onChange={(v) => set("allow_camera_capture", v)} />
                  <ToggleRow label="Allow gallery upload" checked={form.allow_gallery_upload ?? true} onChange={(v) => set("allow_gallery_upload", v)} />
                  <FormField label="Camera Mode">
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.camera_mode ?? "both"}
                      onChange={(e) => set("camera_mode", e.target.value as LVEvent["camera_mode"])}
                    >
                      <option value="both">Both (selfie + event photo)</option>
                      <option value="rear">Rear camera only (event photo)</option>
                      <option value="front">Front camera only (selfie)</option>
                    </select>
                  </FormField>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FormField label="Selfie button label">
                      <Input value={form.selfie_button_label ?? ""} onChange={(e) => set("selfie_button_label", e.target.value)} />
                    </FormField>
                    <FormField label="Event photo label">
                      <Input value={form.rear_camera_button_label ?? ""} onChange={(e) => set("rear_camera_button_label", e.target.value)} />
                    </FormField>
                    <FormField label="Gallery label">
                      <Input value={form.gallery_button_label ?? ""} onChange={(e) => set("gallery_button_label", e.target.value)} />
                    </FormField>
                  </div>
                </div>

                {/* Moderation */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-1">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Moderation</p>
                  <ToggleRow label="Require attendee name" checked={form.require_name ?? false} onChange={(v) => set("require_name", v)} />
                  <ToggleRow label="Require caption" checked={form.require_caption ?? false} onChange={(v) => set("require_caption", v)} />
                  <ToggleRow label="Require consent" checked={form.require_consent ?? true} onChange={(v) => set("require_consent", v)} />
                  <ToggleRow label="Auto-approve uploads" hint="Photos go live immediately without review" checked={form.auto_approve ?? false} onChange={(v) => set("auto_approve", v)} />
                </div>

                {/* Slideshow */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Slideshow</p>
                  <FormField label="Interval (seconds)">
                    <Input
                      type="number"
                      min={3}
                      max={60}
                      value={form.slideshow_interval_seconds ?? 7}
                      onChange={(e) => set("slideshow_interval_seconds", Number(e.target.value))}
                      className="w-28"
                    />
                  </FormField>
                  <ToggleRow label="Show captions" checked={form.show_captions ?? true} onChange={(v) => set("show_captions", v)} />
                  <ToggleRow label="Show attendee names" checked={form.show_names ?? false} onChange={(v) => set("show_names", v)} />
                  <ToggleRow label="Show sponsor area" checked={form.show_sponsors ?? true} onChange={(v) => set("show_sponsors", v)} />
                  <ToggleRow label="Show event logo" checked={form.show_logo ?? true} onChange={(v) => set("show_logo", v)} />
                  <ToggleRow label="Show QR code on screen" checked={form.show_qr_code_on_screen ?? true} onChange={(v) => set("show_qr_code_on_screen", v)} />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar — QR + links */}
          <div className="lg:col-span-1">
            {slug ? (
              <QRPanel slug={slug} />
            ) : (
              <div className="bg-card border border-border rounded-xl p-5 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                <QrCode size={32} className="text-muted-foreground/40" />
                <p>Enter an event name to generate the QR code and URLs.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
