import AuditLottie from "@/components/website-audit/AuditLottie";
import { useAdvisorVoice } from "@/hooks/useAdvisorVoice";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MessageSquare,
  Plus,
  Mic,
  Volume2,
  Bot,
  Send,
  Square,
  Copy,
  Pencil,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { loadAdvisorChats, saveAdvisorChat, type AdvisorSession } from "@/hooks/usePortal";
import { appendDictation } from "@/lib/portal/voice";
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
  const [historyOpen,setHistoryOpen]=useState(false);
  const [sessions,setSessions]=useState<AdvisorSession[]>([]);
  // Ids are generated here rather than by the database so a new chat exists the
  // moment it is opened, before it has anything worth saving.
  const [sessionId,setSessionId]=useState<string>(()=>crypto.randomUUID());
  const switchSession=(id?:string)=>{
    if(id===sessionId)return;
    stop();
    setHistoryOpen(false);
    setSessions(v=>{
      const other=v.filter(c=>c.id!==sessionId);
      return messages.length||input.trim()?[...other,{id:sessionId,messages,input,updatedAt:Date.now()}]:other;
    });
    const target=sessions.find(c=>c.id===id);
    setSessionId(id??crypto.randomUUID());
    setMessages(target?.messages??[]);
    setInput(target?.input??"");
    setError("");
    setDraft(null);
  };
  // The open chat is stamped with the current time so it always heads the list.
  const sessionList=[...sessions.filter(c=>c.id!==sessionId),{id:sessionId,messages,input,updatedAt:Date.now()}].filter(c=>c.messages.length||c.input.trim()).sort((a,b)=>b.updatedAt-a.updatedAt);
  const [autoRead,setAutoRead]=useState(false);
  const autoReadRef=useRef(false);
  // The preview has no workspace to bill against, so it keeps the system voice.
  const voice=useAdvisorVoice(language,active,text=>setInput(v=>appendDictation(v,text).slice(0,8000)),preview?undefined:org);
  const voiceRef=useRef(voice);voiceRef.current=voice;
  // What the composer shows: the message so far plus the words still being
  // heard. Speech lands in the box it will be sent from rather than arriving in
  // a lump when the microphone closes, and because the box is the whole message,
  // sending mid-sentence sends what the person can actually see.
  const dictated = voice.listening ? appendDictation(input, voice.interim) : input;
  /** Keeps the unsettled words rather than discarding them with the microphone. */
  const finishDictation = () => {
    const words = voice.interim.trim();
    voice.stopListening();
    if (words) setInput((v) => appendDictation(v, words).slice(0, 8000));
  };
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

  // Restore this representative's saved chats once, and reopen the most recent
  // one so the last conversation is simply still there.
  const restored = useRef(false);
  useEffect(() => {
    if (preview || !org || restored.current) return;
    restored.current = true;
    let cancelled = false;
    loadAdvisorChats(org)
      .then((saved) => {
        if (cancelled || !saved.length) return;
        setSessions(saved);
        const latest = saved[0];
        setSessionId(latest.id);
        setMessages(latest.messages);
        setInput(latest.input);
      })
      // History is a convenience; failing to read it must not block the Advisor.
      .catch((cause) => console.error("advisor history unavailable", cause));
    // The guard is released on teardown as well as set on entry. Without the
    // reset, StrictMode's mount/unmount/mount in development discards the first
    // fetch and then skips the second, so history silently never arrives.
    return () => { cancelled = true; restored.current = false; };
  }, [org, preview]);

  // Persist after a pause rather than on every keystroke or token. The unsent
  // draft is saved alongside the messages, so a half-typed question survives a
  // refresh the same way the answers do.
  useEffect(() => {
    if (preview || !org) return;
    if (!messages.length && !input.trim()) return;
    const handle = window.setTimeout(() => {
      saveAdvisorChat(org, sessionId, messages, input)
        .catch((cause) => console.error("advisor chat save failed", cause));
    }, 700);
    return () => window.clearTimeout(handle);
  }, [messages, input, sessionId, org, preview]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    // Sending while the microphone is open is not a mistake to block; it is
    // someone who has finished talking. Close the microphone and send what they
    // are looking at, unsettled last words included.
    if (preview || busy || !dictated.trim()) return;
    voice.stop();
    const message: Message = { role: "user", content: dictated.trim() };
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
    <section className="relative h-full min-h-0 flex overflow-hidden bg-background">
      {historyOpen&&<button className="absolute inset-0 bg-black/30 z-20 lg:hidden" aria-label={p("closeHistory")} onClick={()=>setHistoryOpen(false)}/>}
      <aside className={`${historyOpen?"flex":"hidden lg:flex"} absolute lg:relative inset-y-0 left-0 z-30 lg:z-auto w-64 shrink-0 border-r bg-[#1b1b1b] text-white p-4 flex-col gap-4`}>
        <div className="flex justify-between items-center"><p className="text-lg font-semibold">{p("chatTitle")}</p><button className="lg:hidden text-sm" onClick={()=>setHistoryOpen(false)}>{p("closeHistory")}</button></div>
        <Button className="w-full gap-2 rounded-xl h-12" onClick={()=>switchSession()}><Plus size={18}/>{p("newConversation")}</Button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-white/45 mb-3">{p("sessionChats")}</p>
          <div className="flex lg:flex-col gap-2 overflow-auto max-h-64 lg:max-h-[480px]">
            {sessionList.length?sessionList.map(c=><button key={c.id} onClick={()=>switchSession(c.id)} aria-current={c.id===sessionId?"page":undefined} className={`flex shrink-0 lg:shrink items-start gap-2 rounded-lg p-3 text-left text-sm max-w-64 ${c.id===sessionId?"bg-white/10 text-white":"text-white/65 hover:bg-white/5"}`}><MessageSquare size={16} className="shrink-0 mt-0.5"/><span className="line-clamp-2 break-words">{c.messages.find(m=>m.role==="user")?.content||c.input}</span></button>):<p className="text-sm text-white/45">{p("noSessionChats")}</p>}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-white/45">{p("sessionOnly")}</p>
      </aside>
      <div className="min-w-0 min-h-0 flex-1 flex flex-col">

      <div className="shrink-0 flex gap-3 items-center border-b px-4 py-3">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={()=>setHistoryOpen(true)} aria-label={p("chatHistory")}><MessageSquare size={18}/></Button>
        <img src="/animations/lv-branding-agent.svg" alt="" className="w-8 h-10 object-contain shrink-0"/>
        <div>
          <h1 className="text-base sm:text-lg font-medium">{p("advisor")}</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">{p("advisorSubtitle")}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
        <div className="shrink-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          <span className="font-medium">{p("generalAdvisor")}</span>
          <span className="text-muted-foreground">· {p("noLeadContext")}</span>
        </div>
        <div
          className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-8 space-y-6 flex-1"
          role="log"
          aria-label={p("advisorConversation")}
          aria-live="polite"
        >
          {!messages.length ? (
            <div className="max-w-2xl mx-auto py-2 sm:py-8 text-center">
              <img src="/animations/lv-branding-agent.svg" alt="LV Branding Agent" className="mx-auto w-20 h-24 sm:w-28 sm:h-32 object-contain"/>
              <h2 className="text-xl sm:text-3xl font-semibold mt-4 tracking-tight">
                {p("chatWelcome")}
              </h2>
              <p className="mt-2 text-base sm:text-xl font-semibold leading-snug">
                {p("chatQuestion")}
              </p>
              <div className="grid sm:grid-cols-2 gap-2 mt-7 text-left">
                {[
                  "advisorIntro",
                  "advisorDiscovery",
                  "advisorPractice",
                  "advisorOutreach",
                ].map((key) => (
                  <button
                    key={key}
                    className="rounded-xl border border-black/5 bg-white/60 p-3 text-sm hover:border-primary/40 hover:bg-white text-left"
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
                  <img src="/animations/lv-branding-agent.svg" alt="" className="shrink-0 w-7 h-9 object-contain mt-1"/>
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
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <AuditLottie src="/animations/lv-advisor-loading.json" className="!w-24 h-24 shrink-0" />
              {streamed ? (
                <ChatMessageText role="assistant" content={streamed} />
              ) : (
                p("advisorThinking")
              )}
            </div>
          )}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="shrink-0 border-t bg-background px-3 py-3 sm:px-6 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {voice.error&&<p role="alert" className="text-sm text-destructive">{p(voice.error)}</p>}
          <Textarea
            className={`border-0 shadow-none resize-none focus-visible:ring-0 text-base p-1 ${voice.listening?"text-muted-foreground":""}`}
            readOnly={voice.listening}
            aria-label={p("advisorMessage")}
            placeholder={p(voice.listening?"listening":"advisorPlaceholder")}
            value={dictated}
            onChange={(e) => setInput(e.target.value)}
            maxLength={8000}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send(e);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* The ring is the recording light: it says the microphone is
                  genuinely open, which a label alone never managed to. */}
              <span className="relative inline-flex">
                {voice.listening && (
                  <span aria-hidden className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[#CB2039]/40" />
                )}
                <Button
                  type="button"
                  size="icon"
                  variant={voice.listening ? "default" : "outline"}
                  disabled={!voice.canListen || busy}
                  aria-pressed={voice.listening}
                  aria-label={p(voice.listening ? "stopListening" : "speakMessage")}
                  title={p(voice.listening ? "stopListening" : "speakMessage")}
                  onClick={() => (voice.listening ? finishDictation() : voice.listen())}
                  className={`relative h-11 w-11 rounded-full ${voice.listening ? "bg-[#CB2039] text-white hover:bg-[#CB2039]/90" : ""}`}
                >
                  {voice.listening ? <Square size={15} className="fill-current" /> : <Mic size={18} />}
                </Button>
              </span>
              {voice.listening ? (
                <span role="status" className="flex items-center gap-1.5 text-xs font-medium text-[#CB2039]">
                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#CB2039]" />
                  {p("listening")}
                </span>
              ) : (
                voice.canSpeak && (
                  <Button
                    type="button"
                    size="sm"
                    variant={autoRead ? "secondary" : "ghost"}
                    aria-pressed={autoRead}
                    aria-label={p("autoRead")}
                    title={p("autoRead")}
                    onClick={()=>{const next=!autoRead;setAutoRead(next);autoReadRef.current=next;if(!next)voice.stopSpeaking();}}
                    className="gap-2 rounded-full text-muted-foreground aria-pressed:text-foreground"
                  >
                    <Volume2 size={15}/><span className="hidden sm:inline">{p("autoRead")}</span>
                  </Button>
                )
              )}
              {voice.speaking&&<Button type="button" size="sm" variant="ghost" className="gap-2 rounded-full" onClick={voice.stopSpeaking}><Square size={13}/>{p("stopReading")}</Button>}
            </div>
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
                disabled={preview || !dictated.trim()}
                className="gap-2"
              >
                <Send size={15} />
                {p("sendMessage")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            {voice.listening
              ? p("listeningHelp")
              : `${p(preview ? "advisorPreview" : "advisorRetention")} ${p(voice.canListen ? "voiceHelp" : "voiceUnavailable")}`}
          </p>
        </form>
      </div>
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
