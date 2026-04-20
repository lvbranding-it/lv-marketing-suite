import { useState, useEffect } from "react";
import { Search, Send, Loader2, AlertCircle, UserPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useApolloSearch,
  useApolloSequences,
  useApolloEmailAccounts,
  pushContactToApollo,
  addContactToSequence,
  type ApolloPerson,
  type ApolloFilters,
} from "@/hooks/useProspecting";
import { useImportContact } from "@/hooks/useContacts";
import { useToast } from "@/hooks/use-toast";

const SENIORITIES = ["owner", "c_suite", "vp", "director", "manager", "senior"];

interface Props {
  onImported?: () => void;
}

export default function ApolloPanel({ onImported }: Props) {
  const { toast } = useToast();
  const { loading, results, total, error, search, reset } = useApolloSearch();
  const { sequences, fetchSequences, loading: seqLoading } = useApolloSequences();
  const { accounts, fetchAccounts } = useApolloEmailAccounts();
  const importContact = useImportContact();

  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("Houston, TX, United States");
  const [seniorities, setSeniorities] = useState<string[]>(["owner", "c_suite"]);
  const [importing, setImporting] = useState<Set<string>>(new Set());

  // Sequence push state
  const [pushTarget, setPushTarget] = useState<ApolloPerson | null>(null);
  const [selectedSeq, setSelectedSeq] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    fetchSequences();
    fetchAccounts();
  }, []);

  const toggleSeniority = (s: string) =>
    setSeniorities((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const handleSearch = () => {
    const filters: ApolloFilters = {
      person_locations: [location],
      person_seniorities: seniorities.length > 0 ? seniorities : undefined,
      q_keywords: keywords || undefined,
    };
    search(filters);
  };

  const handleImport = async (p: ApolloPerson) => {
    setImporting((s) => new Set(s).add(p.id));
    try {
      await importContact.mutateAsync({
        branch_id: null,
        first_name: p.first_name,
        last_name: p.last_name,
        title: p.title,
        company: p.organization_name,
        email: p.email,
        phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
        linkedin_url: p.linkedin_url,
        website: p.organization?.website_url ?? p.organization?.primary_domain ?? null,
        city: p.city,
        state: p.state,
        country: p.country ?? "US",
        industry: null,
        employees_range: null,
        fit_score: null,
        signals: [],
        source: "apollo",
        source_id: p.id,
        apollo_id: p.id,
        raw_data: p as Record<string, unknown>,
        verification_status: "unverified" as const,
      });
      toast({ description: `${p.first_name} ${p.last_name} imported.` });
      onImported?.();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImporting((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  };

  const handlePushToSequence = async () => {
    if (!pushTarget || !selectedSeq || !selectedAccount) return;
    setPushing(true);
    try {
      // Ensure contact exists in Apollo CRM (upsert)
      let apolloId = pushTarget.id;
      if (!apolloId.match(/^[a-f0-9]{24}$/)) {
        // Looks like it might be a database search ID, create in Apollo
        const { apollo_id } = await pushContactToApollo({
          first_name: pushTarget.first_name ?? undefined,
          last_name: pushTarget.last_name ?? undefined,
          title: pushTarget.title ?? undefined,
          email: pushTarget.email ?? undefined,
          organization_name: pushTarget.organization_name ?? undefined,
        });
        apolloId = apollo_id;
      }
      await addContactToSequence({
        campaign_id: selectedSeq,
        contact_ids: [apolloId],
        email_account_id: selectedAccount,
      });
      toast({ description: `${pushTarget.first_name} added to sequence!` });
      setPushTarget(null);
      setSelectedSeq("");
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to add to sequence" });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search filters */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Apollo People Search
        </p>

        {/* Seniority */}
        <div className="space-y-1.5">
          <Label className="text-xs">Seniority</Label>
          <div className="flex flex-wrap gap-1.5">
            {SENIORITIES.map((s) => (
              <button
                key={s}
                onClick={() => toggleSeniority(s)}
                className={`px-2.5 py-1 text-[10px] uppercase tracking-wide border rounded-sm transition-colors ${
                  seniorities.includes(s)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <Label className="text-xs">Location</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Houston, TX, United States"
            className="h-9 text-sm"
          />
        </div>

        {/* Keywords */}
        <div className="space-y-1.5">
          <Label className="text-xs">Keywords</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. branding agency, CMO, marketing director"
            className="h-9 text-sm"
          />
        </div>

        <Button onClick={handleSearch} disabled={loading} className="w-full">
          {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Search size={14} className="mr-2" />}
          {loading ? "Searching Apollo…" : "Search Apollo"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Sequence push panel */}
      {pushTarget && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Add <strong>{pushTarget.first_name} {pushTarget.last_name}</strong> to Apollo Sequence
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sequence</Label>
              <Select value={selectedSeq} onValueChange={setSelectedSeq}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select sequence…" />
                </SelectTrigger>
                <SelectContent>
                  {sequences.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Send from</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Email account…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handlePushToSequence}
              disabled={pushing || !selectedSeq || !selectedAccount}
            >
              {pushing ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Send size={12} className="mr-1.5" />}
              Add to Sequence
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPushTarget(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing <span className="text-foreground font-medium">{results.length}</span>
              {total > results.length && ` of ${total.toLocaleString()}`} people
            </p>
            <Button variant="ghost" size="sm" className="text-xs" onClick={reset}>Clear</Button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_0.8fr_120px] bg-muted/50 border-b border-border">
              {["Name / Email", "Title", "Company", "Actions"].map((col) => (
                <div key={col} className="px-3 py-2 text-[9px] uppercase tracking-widest text-muted-foreground border-r border-border last:border-r-0">
                  {col}
                </div>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {results.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_1fr_0.8fr_120px] border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <div className="px-3 py-2.5 flex flex-col justify-center overflow-hidden">
                    <span className="text-sm font-medium truncate">{p.first_name} {p.last_name}</span>
                    {p.email
                      ? <span className="text-[10px] text-primary truncate">{p.email}</span>
                      : <span className="text-[10px] text-muted-foreground/40">No email</span>}
                  </div>
                  <div className="px-3 py-2.5 flex items-center overflow-hidden border-l border-border">
                    <span className="text-xs text-muted-foreground truncate">{p.title ?? "—"}</span>
                  </div>
                  <div className="px-3 py-2.5 flex items-center overflow-hidden border-l border-border">
                    <span className="text-xs text-sky-500 truncate">{p.organization_name ?? "—"}</span>
                  </div>
                  <div className="px-2 py-2 flex items-center gap-1 border-l border-border">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleImport(p)}
                      disabled={importing.has(p.id)}
                      title="Import to My Contacts"
                    >
                      {importing.has(p.id)
                        ? <Loader2 size={12} className="animate-spin" />
                        : <UserPlus size={12} />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setPushTarget(p)}
                      title="Add to Apollo Sequence"
                    >
                      <Send size={12} />
                    </Button>
                    {p.linkedin_url && (
                      <a href={`https://${p.linkedin_url}`} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="LinkedIn">
                          <ExternalLink size={12} />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sequences overview */}
      {sequences.length > 0 && results.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your Apollo Sequences
          </p>
          <div className="space-y-2">
            {sequences.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-b-0">
                <span className="text-sm text-foreground">{s.name}</span>
                <Badge variant="outline" className={s.active ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground"}>
                  {s.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !error && sequences.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <p className="text-2xl mb-2">🚀</p>
          Search Apollo's database to find and push prospects directly into your sequences.
        </div>
      )}
    </div>
  );
}
