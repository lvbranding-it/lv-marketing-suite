import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Loader2, Bot, User, Copy, RefreshCw, ChevronDown,
  FileDown, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { agents, getAgent, CATEGORY_LABELS, CATEGORY_COLORS, routeMessage } from "@/lib/agents";
import { useRunAgent, useAgentRun, type RunResult } from "@/hooks/useAgentRuns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import DiscoveryForm from "./DiscoveryForm";
import QuickFieldChips from "./QuickFieldChips";

export interface ChatMessage {
  type:      "user" | "agent";
  content:   string;
  agentId?:  string;
  runResult?: RunResult;
}

interface Props {
  projectId:       string;
  projectName:     string;
  orgId:           string;
  onRunComplete:   (result: RunResult) => void;
  initialAgentId?: string;
  loadRunId?:      string | null;
}

// ── Section accordion ─────────────────────────────────────────────────────────
function SectionsAccordion({ sections }: { sections: { key: string; title: string; content: string }[] }) {
  if (!sections.length) return null;
  return (
    <Accordion type="multiple" className="mt-3 border border-border rounded-lg overflow-hidden">
      {sections.map((s) => (
        <AccordionItem key={s.key} value={s.key} className="border-b last:border-0">
          <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline hover:bg-muted/50">
            <span className="flex items-center gap-2">
              <span className="text-rose-500 font-mono">{s.key})</span>
              {s.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-1">
            <div className="prose prose-sm max-w-none text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// ── Single run loader (when clicking history) ─────────────────────────────────
function RunLoader({ runId, onLoad }: { runId: string; onLoad: (msgs: ChatMessage[]) => void }) {
  const { data: run } = useAgentRun(runId);
  useEffect(() => {
    if (!run) return;
    const msgs: ChatMessage[] = [];
    if (run.input?.text) msgs.push({ type: "user", content: run.input.text });
    if (run.output_full_text) {
      msgs.push({
        type:      "agent",
        content:   run.output_full_text,
        agentId:   run.agent_id,
        runResult: {
          runId:          run.id,
          agentId:        run.agent_id,
          outputFullText: run.output_full_text,
          outputSections: run.output_sections,
          brandSnapshot:  run.brand_snapshot,
          snapshotDelta:  run.snapshot_delta,
          usage:          run.usage,
          status:         run.status,
        },
      });
    }
    onLoad(msgs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return null;
}

// ── PDF export (branded, LV header + QR code) ─────────────────────────────────
function exportPdf(content: string, runId: string, agentIdForExport?: string, projectId?: string) {
  const agentName = getAgent(agentIdForExport || "")?.shortName || "Agent Output";
  const projectUrl = `${window.location.origin}/agents/${projectId}`;
  const qrCodeUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(projectUrl)}&bgcolor=FFFFFF&color=231F20&margin=4`;

  const lvLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250.1 250.1" width="48" height="48"><circle cx="125.05" cy="125.05" r="125.05" fill="#fff"/><path fill="#CB2039" d="M125.05,16.67c-27.38,0-52.38,10.15-71.46,26.9v75.86c0,2.73,2.21,4.95,4.95,4.95h35.88c3.7.03,4.58,2.56,4.9,5.59.33,3.2.57,6.07,1.06,10.21.55,4.71-1.97,6.04-5.85,6.04h-57.49c-2.73,0-4.95-2.21-4.95-4.95v-71.95c-9.79,16.29-15.41,35.35-15.41,55.74,0,59.86,48.52,108.38,108.38,108.38.39,0,.77,0,1.16,0-3.84-30.87-11.01-75.15-14.66-104.58-.29-2.39,1.07-4.62,3.48-4.62h11.07c1.68,0,3.13,1.16,3.51,2.79,0,0,6.42,51,9.08,72.65.52,4.22,4.49,8.51,9.26-.05,12.67-22.75,28.78-51.64,41-72.55.86-1.47,2.4-2.72,4.1-2.7,5.12.07,12.08,0,15.73,0,3.37,0,4.57,2.3,3.48,4.45-15.39,30.22-42.66,69.2-59.08,100.94,46.23-12.38,80.27-54.56,80.27-104.7,0-59.86-48.52-108.38-108.38-108.38Z"/></svg>`;

  // Simple markdown → html conversion
  let html = content
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr/>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");

  // Tables
  html = html.replace(
    /(\|.+\|[\r\n]+\|[\s:|-]+\|[\r\n]+((?:\|.+\|[\r\n]*)+))/g,
    (match) => {
      const lines = match.trim().split("\n").filter((l) => l.trim());
      if (lines.length < 2) return match;
      const parseRow = (line: string) =>
        line.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1).map((c) => c.trim());
      const headers = parseRow(lines[0]);
      const dataRows = lines.slice(2);
      let table = "<table><thead><tr>";
      headers.forEach((h) => { table += `<th>${h}</th>`; });
      table += "</tr></thead><tbody>";
      dataRows.forEach((row) => {
        const cells = parseRow(row);
        table += "<tr>";
        cells.forEach((c) => { table += `<td>${c}</td>`; });
        table += "</tr>";
      });
      table += "</tbody></table>";
      return table;
    },
  );

  html = html.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join("\n");

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) { toast({ description: "Failed to generate PDF", variant: "destructive" }); return; }

  doc.open();
  doc.write(`<!DOCTYPE html><html><head>
  <title>${agentName} — Run ${runId.slice(0, 8)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fira+Sans:wght@300;400;600;700&display=swap');
    @page { margin: 0.75in 1in; size: letter; }
    body { font-family:'Fira Sans','Segoe UI',system-ui,sans-serif;font-size:11pt;line-height:1.6;color:#231F20;max-width:100%; }
    h1 { font-size:18pt;margin:0 0 2pt;color:#231F20;font-weight:700; }
    h2 { font-size:14pt;margin:16pt 0 6pt;color:#231F20;border-left:3px solid #CB2039;padding-left:8px; }
    h3 { font-size:12pt;margin:12pt 0 4pt;color:#231F20; }
    p { margin:4pt 0; }
    strong { font-weight:600; }
    table { border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt; }
    th,td { border:1px solid #ddd;padding:6px 10px;text-align:left; }
    th { background:#231F20;color:#fff;font-weight:600; }
    tr:nth-child(even) td { background:#f9f9f9; }
    li { margin:2pt 0; }
    hr { border:none;border-top:1px solid #ddd;margin:12pt 0; }
    .header-bar { display:flex;align-items:center;gap:16px;border-bottom:3px solid #CB2039;padding-bottom:12pt;margin-bottom:20pt; }
    .header-logo { flex-shrink:0;width:48px;height:48px;background:#231F20;border-radius:8px;padding:4px; }
    .header-text { flex:1; }
    .header-brand { font-size:16pt;font-weight:700;color:#231F20;margin:0; }
    .header-slogan { font-size:9pt;color:#CB2039;font-weight:600;letter-spacing:.5px;margin:2pt 0 0;text-transform:uppercase; }
    .header-meta { font-size:9pt;color:#888;margin-top:4pt; }
    .header-qr { flex-shrink:0;text-align:center; }
    .header-qr img { width:80px;height:80px;border:1px solid #eee;border-radius:4px; }
    .header-qr-label { font-size:7pt;color:#999;margin-top:2pt; }
    .confidential { margin-top:32pt;padding-top:12pt;border-top:1px solid #ddd;font-size:8pt;color:#999;text-align:center;line-height:1.4; }
    .confidential strong { color:#CB2039; }
    @media print {
      .header-logo,.header-qr img { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
      th { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
    }
  </style></head><body>
  <div class="header-bar">
    <div class="header-logo">${lvLogoSvg}</div>
    <div class="header-text">
      <div class="header-brand">LV Branding</div>
      <div class="header-slogan">Strategy that works. Creativity that moves.</div>
      <div class="header-meta">${agentName} · Run ${runId.slice(0, 8)} · ${new Date().toLocaleDateString()}</div>
    </div>
    <div class="header-qr">
      <img src="${qrCodeUrl}" alt="Project QR" />
      <div class="header-qr-label">Scan to open project</div>
    </div>
  </div>
  ${html}
  <div class="confidential">
    <strong>CONFIDENTIAL</strong><br/>
    This document is the property of LV Branding and is intended solely for the use of the individual or entity to whom it is addressed.
    Unauthorized reproduction, distribution, or disclosure is strictly prohibited.
    © ${new Date().getFullYear()} LV Branding. All rights reserved.
  </div>
</body></html>`);
  doc.close();
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 250);
  };
  setTimeout(() => {
    try { iframe.contentWindow?.print(); } catch { /* ignore */ }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1000);
  }, 500);
}

function exportMarkdown(content: string, runId: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `run-${runId.slice(0, 8)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse numbered questions (e.g. "1. What is X?") from agent message */
function parseDiscoveryQuestions(text: string): string[] | null {
  const lines = text.split("\n");
  const questions: string[] = [];
  const regex = /^\d+[\.\)]\s+(.+\?)\s*$/;
  for (const line of lines) {
    const match = line.trim().match(regex);
    if (match) questions.push(match[1]);
  }
  return questions.length >= 2 ? questions : null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentRunChat({
  projectId, projectName, orgId, onRunComplete, initialAgentId, loadRunId,
}: Props) {
  const [agentId,         setAgentId]         = useState(initialAgentId ?? "smart");
  const [language,        setLanguage]        = useState("EN");
  const [input,           setInput]           = useState("");
  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [projectAgentIds, setProjectAgentIds] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const runAgent  = useRunAgent();

  // Load historical agents used in this project
  useEffect(() => {
    supabase
      .from("agent_runs")
      .select("agent_id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) {
          const seen = new Set<string>();
          const unique = (data as { agent_id: string }[])
            .map((r) => r.agent_id)
            .filter((id) => !seen.has(id) && seen.add(id));
          setProjectAgentIds(unique);
        }
      });
  }, [projectId]);

  // Build the combined agent artifact trail (historical + current session)
  const artifactAgentIds = (() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of projectAgentIds) {
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
    for (const m of messages) {
      if (m.agentId && !seen.has(m.agentId)) { seen.add(m.agentId); ids.push(m.agentId); }
    }
    return ids.map((id) => getAgent(id)).filter(Boolean);
  })();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRunLoaded = (msgs: ChatMessage[]) => setMessages(msgs);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || runAgent.isPending) return;

    const resolvedAgentId = agentId === "smart" ? routeMessage(text) : agentId;

    const history: { role: "user" | "assistant"; content: string }[] = messages.map((m) => ({
      role:    m.type === "user" ? "user" : "assistant",
      content: m.content,
    }));

    setMessages((prev) => [...prev, { type: "user", content: text }]);
    setInput("");

    try {
      const result = await runAgent.mutateAsync({
        orgId,
        projectId,
        agentId: resolvedAgentId,
        input:   text,
        languageControl: { language },
        conversationHistory: history,
      });

      setMessages((prev) => [
        ...prev,
        {
          type:      "agent",
          content:   result.outputFullText,
          agentId:   result.agentId,
          runResult: result,
        },
      ]);
      onRunComplete(result);
    } catch (err) {
      toast({
        title:       "Agent failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant:     "destructive",
      });
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    }
  };

  const handleDiscoverySubmit = (formattedAnswers: string) => {
    handleSend(formattedAnswers);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard" });
  };

  const handleRevise = (msg: ChatMessage) => {
    const feedback = window.prompt("Enter revision feedback:");
    if (!feedback?.trim() || !msg.runResult) return;
    const parentAgentId = msg.agentId ?? agentId;
    const feedbackText = `Revise: ${feedback.trim()}`;

    setMessages((prev) => [...prev, { type: "user", content: feedbackText }]);

    (async () => {
      try {
        const result = await runAgent.mutateAsync({
          orgId,
          projectId,
          agentId: parentAgentId === "smart" ? "brief_strategy_deliverables_v1" : parentAgentId,
          input:   feedback.trim(),
          languageControl: { language },
          mode:    "revise",
        });
        setMessages((prev) => [
          ...prev,
          {
            type:      "agent",
            content:   result.outputFullText,
            agentId:   result.agentId,
            runResult: result,
          },
        ]);
        onRunComplete(result);
      } catch (err) {
        toast({
          title: "Revise failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
        setMessages((prev) => prev.slice(0, -1));
      }
    })();
  };

  const currentAgent = getAgent(agentId);

  return (
    <div className="flex flex-col h-full">
      {/* Load run from history */}
      {loadRunId && <RunLoader runId={loadRunId} onLoad={handleRunLoaded} />}

      {/* Agent artifact trail */}
      {artifactAgentIds.length > 0 && (
        <div className="shrink-0 px-4 pt-2 pb-1 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-transparent">
          {artifactAgentIds.map((agent, idx) => {
            const AgentIcon = agent!.icon;
            return (
              <div key={agent!.id} className="flex items-center gap-1 shrink-0">
                {idx > 0 && (
                  <span className="text-gray-300 text-[10px] mx-0.5">→</span>
                )}
                <div className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 border text-[10px] font-medium",
                  CATEGORY_COLORS[agent!.category],
                )}>
                  <AgentIcon className="h-3 w-3" />
                  <span>{agent!.shortName}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent + language selectors */}
      <div className="shrink-0 border-b px-4 py-2 flex items-center gap-2 flex-wrap bg-background">
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="h-8 text-xs w-52">
            <SelectValue placeholder="Select agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smart">
              <span className="flex items-center gap-1.5">
                <Bot size={12} className="text-rose-500" />
                Smart Chat (auto-route)
              </span>
            </SelectItem>
            {(["sales", "strategy", "delivery", "ops"] as const).map((cat) => (
              <div key={cat}>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {CATEGORY_LABELS[cat]}
                </div>
                {agents.filter((a) => a.category === cat).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-1.5">
                      <a.icon size={12} />
                      {a.shortName}
                    </span>
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EN">English</SelectItem>
            <SelectItem value="ES">Español</SelectItem>
            <SelectItem value="BILINGUAL">Bilingual</SelectItem>
          </SelectContent>
        </Select>

        {messages.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs ml-auto text-muted-foreground"
            onClick={() => setMessages([])}
          >
            Clear chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-4 space-y-5 max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Bot size={36} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {projectName ? `Working on: ${projectName}` : "Select a project to start"}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
                Pick an agent above and type your input. The agent will ask questions first, then deliver the full output.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.type === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[80%]">
                    <div className="bg-rose-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    <div className="shrink-0 w-7 h-7 bg-muted rounded-full flex items-center justify-center mt-0.5">
                      <User size={14} />
                    </div>
                  </div>
                </div>
              );
            }

            const agent    = msg.agentId ? getAgent(msg.agentId) : undefined;
            const catColor = agent ? CATEGORY_COLORS[agent.category] : "bg-muted text-muted-foreground";
            const sections = msg.runResult?.outputSections ?? [];
            const displayText = msg.content.replace(/<SNAPSHOT_JSON>[\s\S]*?<\/SNAPSHOT_JSON>/gi, "").trim();

            // Parse discovery questions only on the last agent message
            const isLastAgent = i === messages.length - 1 && !runAgent.isPending;
            const discoveryQuestions = isLastAgent ? parseDiscoveryQuestions(displayText) : null;

            return (
              <div key={i} className="flex gap-2.5">
                <div className="shrink-0 w-7 h-7 bg-rose-100 rounded-full flex items-center justify-center mt-0.5">
                  <Bot size={14} className="text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  {agent && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", catColor)}>
                        {agent.shortName}
                      </Badge>
                    </div>
                  )}

                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="prose prose-sm max-w-none text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
                    </div>

                    {/* Discovery form — rendered inside the message bubble */}
                    {discoveryQuestions && (
                      <DiscoveryForm
                        questions={discoveryQuestions}
                        onSubmit={handleDiscoverySubmit}
                        disabled={runAgent.isPending}
                      />
                    )}

                    {/* Structured sections accordion */}
                    {sections.length > 0 && (
                      <>
                        <p className="text-[10px] text-muted-foreground mt-3 mb-1 font-medium uppercase tracking-wider flex items-center gap-1">
                          <ChevronDown size={10} />
                          Structured Sections
                        </p>
                        <SectionsAccordion sections={sections} />
                      </>
                    )}
                  </div>

                  {/* Action row */}
                  {msg.runResult && (
                    <div className="flex items-center gap-2 mt-1.5 px-1 flex-wrap">
                      <button
                        onClick={() => handleCopy(displayText)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy size={11} /> Copy
                      </button>
                      <button
                        onClick={() => handleRevise(msg)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RefreshCw size={11} /> Revise
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                            <FileDown size={11} /> Export
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="text-xs">
                          <DropdownMenuItem
                            onClick={() => exportPdf(displayText, msg.runResult!.runId, msg.agentId, projectId)}
                            className="text-xs gap-2"
                          >
                            <FileText size={12} /> Export as PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              exportMarkdown(displayText, msg.runResult!.runId);
                              toast({ description: "Exported as Markdown" });
                            }}
                            className="text-xs gap-2"
                          >
                            <FileDown size={12} /> Export as Markdown
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {msg.runResult?.usage && (
                        <span className="text-[10px] text-muted-foreground/50 ml-auto">
                          {(msg.runResult.usage as { input_tokens?: number; output_tokens?: number }).output_tokens?.toLocaleString()} tokens
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking indicator */}
          {runAgent.isPending && (
            <div className="flex gap-2.5">
              <div className="shrink-0 w-7 h-7 bg-rose-100 rounded-full flex items-center justify-center">
                <Bot size={14} className="text-rose-600" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-rose-500" />
                <span className="text-sm text-muted-foreground">Agent is thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="shrink-0 border-t px-4 py-3 bg-background">
        <div className="max-w-4xl mx-auto">
          {/* QuickFieldChips on first message for agents with required fields */}
          {messages.length === 0 && agentId !== "smart" && currentAgent && currentAgent.requiredFields.length > 0 && (
            <QuickFieldChips
              fields={currentAgent.requiredFields}
              onSubmit={(text) => setInput((prev) => prev ? prev + "\n" + text : text)}
            />
          )}
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Type your input… (Enter to send, Shift+Enter for new line)`}
              className="min-h-[72px] max-h-48 resize-none text-sm flex-1"
              disabled={runAgent.isPending}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || runAgent.isPending}
              size="sm"
              className="shrink-0 h-9 gap-1.5"
            >
              {runAgent.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <Send size={14} />
              }
              Send
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter to send · Shift+Enter for new line · Agents follow a 2-phase flow: questions first, then full output
          </p>
        </div>
      </div>
    </div>
  );
}
