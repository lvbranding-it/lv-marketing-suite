import { useState } from "react";
import { Search, Download, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useVibeSearch, type VibeFilters, type VibeProspect } from "@/hooks/useProspecting";
import { useImportContact } from "@/hooks/useContacts";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const JOB_LEVELS = ["c-suite", "owner", "vice president", "director", "manager", "senior"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const TX_REGIONS = [
  { label: "Houston", value: "US-TX", city: "houston" },
  { label: "Dallas / Fort Worth", value: "US-TX", city: "dallas" },
  { label: "Austin", value: "US-TX", city: "austin" },
  { label: "San Antonio", value: "US-TX", city: "san antonio" },
  { label: "All Texas", value: "US-TX", city: "" },
];

interface Props {
  onImported?: () => void;
}

export default function ProspectSearchPanel({ onImported }: Props) {
  const { toast } = useToast();
  const { loading, results, total, error, search, reset } = useVibeSearch();
  const importContact = useImportContact();

  const [jobLevels, setJobLevels] = useState<string[]>(["c-suite", "owner"]);
  const [companySize, setCompanySize] = useState("1-200");
  const [region, setRegion] = useState("US-TX");
  const [hasEmail, setHasEmail] = useState(true);
  const [keywords, setKeywords] = useState("");
  const [importing, setImporting] = useState<Set<string>>(new Set());

  const toggleLevel = (level: string) => {
    setJobLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const handleSearch = () => {
    const filters: VibeFilters = {
      prospect_region_country_code: [region],
      job_level: jobLevels.length > 0 ? jobLevels : undefined,
      has_email: hasEmail || undefined,
      website_keywords: keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    };
    search(filters, 50);
  };

  const handleImport = async (p: VibeProspect) => {
    const key = p.prospect_id ?? `${p.first_name}-${p.last_name}`;
    setImporting((s) => new Set(s).add(key));
    try {
      await importContact.mutateAsync({
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
        title: p.job_title ?? null,
        company: p.company_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        linkedin_url: p.linkedin_url ?? null,
        website: p.company_domain ?? null,
        city: p.city ?? null,
        state: p.region ?? null,
        country: p.country ?? "US",
        industry: p.industry ?? null,
        employees_range: p.company_size ?? null,
        fit_score: null,
        signals: [],
        source: "vibe",
        source_id: p.prospect_id ?? null,
        apollo_id: null,
        raw_data: p as Record<string, unknown>,
        verification_status: "unverified" as const,
      });
      toast({ description: `${p.first_name} ${p.last_name} imported to My Contacts.` });
      onImported?.();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImporting((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Vibe Prospecting Filters
        </p>

        {/* Job levels */}
        <div className="space-y-1.5">
          <Label className="text-xs">Seniority</Label>
          <div className="flex flex-wrap gap-1.5">
            {JOB_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  "px-2.5 py-1 text-[10px] uppercase tracking-wide border rounded-sm transition-colors",
                  jobLevels.includes(level)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Region */}
          <div className="space-y-1.5">
            <Label className="text-xs">Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TX_REGIONS.map((r) => (
                  <SelectItem key={r.label} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Company size */}
          <div className="space-y-1.5">
            <Label className="text-xs">Company size</Label>
            <Select value={companySize} onValueChange={setCompanySize}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_SIZES.map((s) => (
                  <SelectItem key={s} value={s}>{s} employees</SelectItem>
                ))}
                <SelectItem value="any">Any size</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-1.5">
          <Label className="text-xs">Website keywords (comma-separated)</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. branding, marketing, design"
            className="h-9 text-sm"
          />
        </div>

        {/* Email filter */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasEmail"
            checked={hasEmail}
            onChange={(e) => setHasEmail(e.target.checked)}
            className="accent-primary"
          />
          <Label htmlFor="hasEmail" className="text-xs cursor-pointer">Only prospects with verified email</Label>
        </div>

        <Button onClick={handleSearch} disabled={loading} className="w-full">
          {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Search size={14} className="mr-2" />}
          {loading ? "Searching…" : "Search Prospects"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing <span className="text-foreground font-medium">{results.length}</span>
              {total > results.length && ` of ${total.toLocaleString()}`} prospects
            </p>
            <Button variant="ghost" size="sm" className="text-xs" onClick={reset}>
              Clear
            </Button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_0.8fr_0.7fr_80px] bg-muted/50 border-b border-border">
              {["Name", "Title / Company", "Location", "Size", ""].map((col) => (
                <div key={col} className="px-3 py-2 text-[9px] uppercase tracking-widest text-muted-foreground border-r border-border last:border-r-0">
                  {col}
                </div>
              ))}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {results.map((p, i) => {
                const key = p.prospect_id ?? `${p.first_name}-${p.last_name}-${i}`;
                const isImporting = importing.has(key);
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[1fr_1fr_0.8fr_0.7fr_80px] border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <div className="px-3 py-2.5 flex flex-col justify-center overflow-hidden">
                      <span className="text-sm font-medium text-foreground truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      {p.email && <span className="text-[10px] text-primary truncate">{p.email}</span>}
                    </div>
                    <div className="px-3 py-2.5 flex flex-col justify-center overflow-hidden border-l border-border">
                      <span className="text-xs text-muted-foreground truncate">{p.job_title ?? "—"}</span>
                      <span className="text-[10px] text-sky-500 truncate">{p.company_name ?? "—"}</span>
                    </div>
                    <div className="px-3 py-2.5 flex items-center text-xs text-muted-foreground overflow-hidden border-l border-border">
                      <span className="truncate">{[p.city, p.region].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                    <div className="px-3 py-2.5 flex items-center border-l border-border">
                      <span className="text-[10px] text-muted-foreground">{p.company_size ?? "—"}</span>
                    </div>
                    <div className="px-2 py-2 flex items-center justify-center border-l border-border">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleImport(p)}
                        disabled={isImporting}
                        title="Import to My Contacts"
                      >
                        {isImporting
                          ? <Loader2 size={12} className="animate-spin" />
                          : <UserPlus size={12} />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <p className="text-2xl mb-2">🔍</p>
          Set your filters and click <strong>Search Prospects</strong> to pull live data from Vibe Prospecting.
        </div>
      )}
    </div>
  );
}
