import React, { useState } from "react";
import { Database, Download, Copy, Check, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

interface Props {
  snapshot:  Record<string, unknown> | null;
  projectId?: string;
}

/** Strip common markdown characters that don't belong in snapshot field values */
function cleanSnapshotString(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

function renderValue(value: unknown, depth = 0): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic text-xs">—</span>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    // Handle double-encoded JSON (string that is itself a JSON object/array)
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object") return renderValue(parsed, depth);
      } catch { /* not valid JSON — fall through to string rendering */ }
    }
    const clean = cleanSnapshotString(trimmed);
    return <span className="text-gray-700 text-sm leading-relaxed break-words">{clean || <span className="text-gray-400 italic">—</span>}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-rose-600 font-mono text-xs">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400 italic text-xs">empty</span>;
    }
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {value.map((item, i) => (
          <Badge key={i} variant="outline" className="text-xs font-normal text-gray-600 border-gray-200 break-words">
            {typeof item === "string" ? cleanSnapshotString(item) : JSON.stringify(item)}
          </Badge>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className={depth > 0 ? "ml-3 border-l border-gray-200 pl-3 mt-1" : "mt-1"}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="py-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {k.replace(/_/g, " ")}
            </p>
            <div className="mt-0.5">{renderValue(v, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-sm text-gray-700 break-words">{String(value)}</span>;
}

/** Convert snapshot to a readable plain-text string for export */
function snapshotToText(snapshot: Record<string, unknown>): string {
  const lines: string[] = ["BRAND SNAPSHOT", "==============", ""];
  function walk(obj: Record<string, unknown>, indent = 0): void {
    for (const [k, v] of Object.entries(obj)) {
      const label = k.replace(/_/g, " ").toUpperCase();
      const pad = "  ".repeat(indent);
      if (Array.isArray(v)) {
        lines.push(`${pad}${label}:`);
        v.forEach((item) => lines.push(`${pad}  • ${typeof item === "string" ? item : JSON.stringify(item)}`));
      } else if (v && typeof v === "object") {
        lines.push(`${pad}${label}:`);
        walk(v as Record<string, unknown>, indent + 1);
      } else {
        lines.push(`${pad}${label}: ${v ?? "—"}`);
      }
      if (indent === 0) lines.push("");
    }
  }
  walk(snapshot);
  return lines.join("\n");
}

/** Deep-search a snapshot object for a string value matching any of the given keys (case-insensitive). */
function findValue(obj: Record<string, unknown>, keys: string[]): string | null {
  const lowerKeys = keys.map((k) => k.toLowerCase().replace(/[_ ]/g, ""));
  for (const [k, v] of Object.entries(obj)) {
    const nk = k.toLowerCase().replace(/[_ ]/g, "");
    if (lowerKeys.includes(nk) && typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = findValue(v as Record<string, unknown>, keys);
      if (found) return found;
    }
  }
  return null;
}

export default function AgentBrandSnapshot({ snapshot, projectId }: Props) {
  const isEmpty = !snapshot || Object.keys(snapshot).length === 0;
  const { org } = useOrg();
  const [copied,    setCopied]    = useState(false);
  const [converting, setConverting] = useState(false);

  const handleCopyJSON = async () => {
    if (!snapshot) return;
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    toast({ description: "Snapshot JSON copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToContacts = async () => {
    if (!snapshot || !org) return;
    setConverting(true);
    try {
      const company = findValue(snapshot, ["brand_name", "brandname", "company_name", "brand", "company", "client", "prospect_name", "name"]);
      const website  = findValue(snapshot, ["website", "url", "site"]);
      const industry = findValue(snapshot, ["industry", "sector", "niche", "vertical"]);
      const location = findValue(snapshot, ["location", "city", "state", "region"]);
      const contactName = findValue(snapshot, ["contact_name", "contact", "owner", "founder", "ceo"]);
      const email   = findValue(snapshot, ["email", "contact_email"]);
      const phone   = findValue(snapshot, ["phone", "telephone", "tel"]);
      const audience = findValue(snapshot, ["target_audience", "audience", "ideal_client"]);
      const offering = findValue(snapshot, ["offer", "offering", "service", "product"]);

      const notesParts: string[] = [];
      if (audience) notesParts.push(`Target Audience: ${audience}`);
      if (offering) notesParts.push(`Offering: ${offering}`);

      // Split city / state from location if possible
      const locationParts = location?.split(",").map((s) => s.trim()) ?? [];
      const city  = locationParts[0] ?? null;
      const state = locationParts[1] ?? null;

      // Check for existing contact with same email
      const existingQuery = supabase
        .from("contacts")
        .select("id")
        .eq("org_id", org.id);
      if (email) existingQuery.eq("email", email);
      else existingQuery.eq("company", company ?? "");

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        await supabase.from("contacts").update({
          company:    company ?? undefined,
          website:    website ?? undefined,
          industry:   industry ?? undefined,
          city:       city ?? undefined,
          state:      state ?? undefined,
          crm_notes:  notesParts.length > 0 ? notesParts.join("\n") : undefined,
        }).eq("id", existing.id);

        if (projectId) {
          // Link project to contact via raw_data tag (no FK column, using raw_data)
          await supabase.from("contacts").update({
            raw_data: { project_id: projectId },
          }).eq("id", existing.id);
        }

        toast({ title: "Contact updated", description: `${company || "Contact"} updated from Brand Snapshot.` });
      } else {
        const { error } = await supabase.from("contacts").insert({
          org_id:          org.id,
          first_name:      contactName?.split(" ")[0] ?? null,
          last_name:       contactName?.split(" ").slice(1).join(" ") || null,
          company:         company ?? null,
          email:           email ?? null,
          phone:           phone ?? null,
          website:         website ?? null,
          industry:        industry ?? null,
          city:            city ?? null,
          state:           state ?? null,
          crm_notes:       notesParts.length > 0 ? notesParts.join("\n") : null,
          pipeline_stage:  "lead",
          source:          "manual",
          raw_data:        projectId ? { project_id: projectId } : {},
          signals:         [],
        });

        if (error) throw error;
        toast({ title: "Contact saved", description: `${company || "New contact"} added to Contacts as a lead.` });
      }
    } catch (err) {
      toast({
        title: "Failed to save contact",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleExport = () => {
    if (!snapshot) return;
    const text = snapshotToText(snapshot);
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "brand-snapshot.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast({ description: "Brand Snapshot exported as .txt" });
  };

  return (
    <div className="w-full flex flex-col h-full bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-rose-500 shrink-0" />
          <span className="text-xs font-bold text-gray-800 uppercase tracking-wide flex-1">Brand Snapshot</span>
          {!isEmpty && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyJSON}
                title="Copy JSON"
                className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
              </button>
              <button
                onClick={handleExport}
                title="Export as .txt"
                className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Download size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database size={28} className="text-gray-300 mb-3" />
              <p className="text-xs font-medium text-gray-500">No snapshot yet</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                The Brand Snapshot is built automatically as you run agents. It accumulates intel about the client across all runs.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(snapshot!).map(([key, val]) => (
                <div key={key} className="border border-gray-200 bg-white rounded-lg p-3 space-y-1 shadow-sm overflow-hidden min-w-0">
                  <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                    {key.replace(/_/g, " ")}
                  </p>
                  {renderValue(val)}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Save to Contacts footer */}
      {!isEmpty && (
        <div className="px-3 py-3 border-t border-gray-200 shrink-0">
          <Button
            className="w-full gap-2 text-xs h-8"
            variant="outline"
            size="sm"
            onClick={handleSaveToContacts}
            disabled={converting || !org}
          >
            <UserPlus size={13} />
            {converting ? "Saving…" : "Save to Contacts"}
          </Button>
        </div>
      )}
    </div>
  );
}
