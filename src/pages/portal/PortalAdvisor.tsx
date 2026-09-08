import { useAdvisorVoice } from "@/hooks/useAdvisorVoice";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Mic,
  Volume2,
  Bot,
  Send,
  Loader2,
  RotateCcw,
  Square,
  Copy,
  Pencil,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { runSkillStream, type Message } from "@/lib/claude";
import ChatMessageText from "@/components/agents/ChatMessageText";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export default function PortalAdvisor({
  org,
  preview,
  active = true,
}: {
  org: string;
  preview: boolean;
  active?: boolean;
}) {
  const { t, language } = useLanguage();
  const p = (k: string) => t(`portal.${k}`);
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [streamed, setStreamed] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const [autoRead,setAutoRead]=useState(false);
  const autoReadRef=useRef(false);
  const voice=useAdvisorVoice(language,active,text=>setInput(v=>(v+(v.trim()?" ":"")+text).slice(0,8000)));
  const voiceRef=useRef(voice);voiceRef.current=voice;
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    end = useRef<HTMLDivElement>(null);
  const stop = () => {
    voice.stop();
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setStreamed("");
  };
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, streamed, busy]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (preview || busy || voice.listening || !input.trim()) return;
    voice.stop();
    const message: Message = { role: "user", content: input.trim() };
    const history = messages.slice(-12);
    while (JSON.stringify(history).length > 32000) history.shift();
    const sequence = ++generation.current;
    controller.current = new AbortController();
    setInput("");
    setError("");
    setStreamed("");
    setBusy(true);
    setMessages((v) => [...v, message]);
    await runSkillStream(
      {
        mode: "portal_advisor",
        orgId: org,
        userMessage: message.content,
        conversationHistory: history,
        language,
      },
      {
        onToken: (token) => {
          if (sequence === generation.current) setStreamed((v) => v + token);
        },
        onComplete: (content) => {
          if (sequence === generation.current) {
            setMessages((v) => [...v, { role: "assistant", content }]);
            setStreamed("");
            setBusy(false);
            if(autoReadRef.current) voiceRef.current.speak(content);
          }
        },
        onError: () => {
          if (sequence === generation.current) {
            setError(p("advisorError"));
            setStreamed("");
            setBusy(false);
          }
        },
      },
      { signal: controller.current.signal },
    );
  };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{p("advisor")}</h1>
          <p className="mt-2 text-muted-foreground">{p("advisorSubtitle")}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            stop();
            setMessages([]);
            setError("");
            setInput("");
          }}
        >
          <RotateCcw size={15} />
          {p("newConversation")}
        </Button>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="border-b px-5 py-3 flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          <span className="font-medium">{p("generalAdvisor")}</span>
          <span className="text-muted-foreground">· {p("noLeadContext")}</span>
        </div>
        <div
          className="min-h-80 max-h-[60vh] overflow-y-auto p-5 sm:p-7 space-y-6"
          role="log"
          aria-label={p("advisorConversation")}
          aria-live="polite"
        >
          {!messages.length ? (
            <div className="max-w-2xl mx-auto py-8 text-center">
              <div className="inline-flex bg-primary/5 p-4 rounded-2xl text-primary">
                <Bot size={32} />
              </div>
              <h2 className="text-xl font-semibold mt-5">
                {p("advisorWelcome")}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {p("advisorWelcomeBody")}
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-7 text-left">
                {[
                  "advisorIntro",
                  "advisorDiscovery",
                  "advisorPractice",
                  "advisorOutreach",
                ].map((key) => (
                  <button
                    key={key}
                    className="rounded-xl border p-4 text-sm hover:border-primary/40 hover:bg-primary/5 text-left"
                    onClick={() => setInput(p(key))}
                  >
                    {p(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? "flex justify-end" : "flex gap-3"
                }
              >
                {m.role === "assistant" && (
                  <Bot className="shrink-0 text-primary mt-2" size={20} />
                )}
                <div
                  className={
                    m.role === "user" ? "max-w-[85%]" : "min-w-0 flex-1"
                  }
                >
                  <ChatMessageText role={m.role} content={m.content} />
                  {m.role==="assistant"&&voice.canSpeak&&<Button type="button" variant="ghost" size="sm" className="gap-2" onClick={()=>voice.speak(m.content)}><Volume2 size={14}/>{p("readAloud")}</Button>}
                  {m.role === "assistant" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 gap-2 text-muted-foreground"
                      onClick={() => {
                        setDraft(m.content);
                        setCopied(false);
                      }}
                    >
                      <Pencil size={14} />
                      {p("editDraft")}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
          {busy && (
            <div
              role="status"
              className="flex gap-3 text-sm text-muted-foreground"
            >
              <Loader2 size={18} className="animate-spin shrink-0" />
              {streamed ? (
                <ChatMessageText role="assistant" content={streamed} />
              ) : (
                p("advisorThinking")
              )}
            </div>
          )}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="border-t p-4 sm:p-5 space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={!voice.canListen||busy} onClick={()=>voice.listening?voice.stopListening():voice.listen()} className="gap-2"><Mic size={15}/>{p(voice.listening?"stopListening":"speakMessage")}</Button>
            {voice.canSpeak&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoRead} onChange={e=>{setAutoRead(e.target.checked);autoReadRef.current=e.target.checked;if(!e.target.checked)voice.stopSpeaking();}}/>{p("autoRead")}</label>}
            {voice.speaking&&<Button type="button" variant="outline" onClick={voice.stopSpeaking}>{p("stopReading")}</Button>}
          </div>
          <p className="text-xs text-muted-foreground">{p(voice.canListen?"voiceHelp":"voiceUnavailable")}</p>
          {voice.listening&&<p role="status">{p("listening")}</p>}
          {voice.error&&<p role="alert" className="text-sm text-destructive">{p(voice.error)}</p>}
          <Textarea
            readOnly={voice.listening}
            aria-label={p("advisorMessage")}
            placeholder={p("advisorPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={8000}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send(e);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground max-w-xl">
              {p(preview ? "advisorPreview" : "advisorRetention")}
            </p>
            {busy ? (
              <Button
                variant="outline"
                type="button"
                onClick={stop}
                className="gap-2"
              >
                <Square size={14} />
                {p("stopResponse")}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={preview || voice.listening || !input.trim()}
                className="gap-2"
              >
                <Send size={15} />
                {p("sendMessage")}
              </Button>
            )}
          </div>
        </form>
      </div>
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p("editDraft")}</DialogTitle>
            <DialogDescription>{p("draftReview")}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={p("editDraft")}
            rows={12}
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            className="gap-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(draft ?? "");
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy size={15} />
            {p(copied ? "draftCopied" : "copyDraft")}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
