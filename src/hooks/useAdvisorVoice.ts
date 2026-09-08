import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBrandSpeech } from "@/lib/portal/speech";
import { pickVoice, speechText, voiceList } from "@/lib/portal/voice";

interface Recognition {
 lang:string; continuous:boolean; interimResults:boolean;
 onresult:((event:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;
 onend:(()=>void)|null;
 start():void; abort():void;
}
type VoiceWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};

/**
 * @param org Workspace the speaker belongs to. Without it the branded voice is
 *   skipped and the browser's own engine is used, which is what the design
 *   preview wants.
 */
export function useAdvisorVoice(language:string,active:boolean,onTranscript:(text:string)=>void,org?:string) {
 const recognition=useRef<Recognition|null>(null),utterance=useRef<SpeechSynthesisUtterance|null>(null);
 const audio=useRef<HTMLAudioElement|null>(null),speechRequest=useRef<AbortController|null>(null);
 // Distinguishes the reply being spoken now from one already abandoned, so a
 // slow request that lands after stop cannot start talking over the silence.
 const speechGeneration=useRef(0);
 const transcript=useRef(onTranscript);transcript.current=onTranscript;
 const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[error,setError]=useState("");
 const supported=typeof window!=="undefined";
 const Constructor=supported?((window as VoiceWindow).SpeechRecognition??(window as VoiceWindow).webkitSpeechRecognition):undefined;
 const canSpeak=supported&&"speechSynthesis" in window&&"SpeechSynthesisUtterance" in window;
 const stopListening=useCallback(()=>{
  const r=recognition.current;recognition.current=null;
  if(r){r.onresult=null;r.onerror=null;r.onend=null;r.abort();}
  setListening(false);
 },[]);
 const stopSpeaking=useCallback(()=>{
  speechGeneration.current++;
  speechRequest.current?.abort();speechRequest.current=null;
  const a=audio.current;audio.current=null;
  if(a){a.onended=null;a.onerror=null;a.pause();URL.revokeObjectURL(a.src);}
  const u=utterance.current;utterance.current=null;
  if(u){u.onend=null;u.onerror=null;window.speechSynthesis.cancel();}
  setSpeaking(false);
 },[]);
 const stop=useCallback(()=>{stopListening();stopSpeaking();},[stopListening,stopSpeaking]);
 useEffect(()=>{stop();setError("");return stop;},[active,language,stop]);
 useEffect(()=>{
  if(!canSpeak)return;
  voiceList();
  const refresh=()=>{voiceList();};
  window.speechSynthesis.addEventListener("voiceschanged",refresh);
  return()=>window.speechSynthesis.removeEventListener("voiceschanged",refresh);
 },[canSpeak]);
 useEffect(()=>{
  const hide=()=>{if(document.hidden)stop();};
  document.addEventListener("visibilitychange",hide);
  return()=>document.removeEventListener("visibilitychange",hide);
 },[stop]);
 const listen=()=>{
  if(!Constructor||!active)return;
  stop();setError("");
  const r=new Constructor();recognition.current=r;
  r.lang=language==="es"?"es-US":"en-US";r.continuous=false;r.interimResults=false;
  r.onresult=event=>{
   if(recognition.current!==r)return;
   const text=Array.from(event.results).filter(v=>v.isFinal).map(v=>v[0].transcript).join(" ");
   if(text)transcript.current(text);
  };
  r.onerror=event=>{if(recognition.current===r)setError(event.error==="not-allowed"||event.error==="service-not-allowed"?"voicePermission":"voiceError");};
  r.onend=()=>{if(recognition.current===r){recognition.current=null;setListening(false);}};
  try{r.start();setListening(true);}catch{stopListening();setError("voiceError");}
 };
 /** The browser's own engine: always available, and the floor under everything. */
 const speakWithSystemVoice=(clean:string)=>{
  const u=new SpeechSynthesisUtterance(clean);utterance.current=u;
  const voice=pickVoice(voiceList(),language);
  u.voice=voice;
  // Follow the chosen voice's own locale. Asking for es-US, which no installed
  // voice provides, is what pushed Spanish onto a mismatched narrator.
  u.lang=voice?.lang??(language==="es"?"es-MX":"en-US");
  // Fractionally under natural pace: enough to stop clause endings running
  // together, not so slow that it drags.
  u.rate=0.97;
  u.onend=()=>{if(utterance.current===u){utterance.current=null;setSpeaking(false);}};
  u.onerror=()=>{if(utterance.current===u){utterance.current=null;setSpeaking(false);setError("voicePlaybackError");}};
  try{window.speechSynthesis.speak(u);setSpeaking(true);}catch{stopSpeaking();setError("voicePlaybackError");}
 };
 const speak=(text:string)=>{
  if(!canSpeak||!active)return;
  stop();setError("");
  const clean=speechText(text,language);if(!clean)return;
  const sequence=++speechGeneration.current;
  // Marked as speaking while the branded audio is still being fetched, so the
  // stop control is live during the second or so before sound starts.
  setSpeaking(true);
  if(!org){speakWithSystemVoice(clean);return;}
  const request=new AbortController();speechRequest.current=request;
  void fetchBrandSpeech(org,clean,language,request.signal).then(clip=>{
   if(sequence!==speechGeneration.current)return;
   speechRequest.current=null;
   // Any reason the brand voice is unavailable ends here, silently, in the
   // system voice. A representative should never be told the voice budget ran
   // out; they should just keep hearing their answers.
   if(!clip){speakWithSystemVoice(clean);return;}
   const element=new Audio(URL.createObjectURL(clip));audio.current=element;
   const release=()=>{URL.revokeObjectURL(element.src);audio.current=null;};
   element.onended=()=>{if(audio.current===element){release();setSpeaking(false);}};
   element.onerror=()=>{if(audio.current===element){release();speakWithSystemVoice(clean);}};
   // Autoplay can still be refused when nothing was clicked, as with a reply
   // read automatically; the system voice covers that too.
   element.play().catch(()=>{if(audio.current===element){release();speakWithSystemVoice(clean);}});
  });
 };
 return {canListen:!!Constructor,canSpeak,listening,speaking,error,listen,speak,stop,stopListening,stopSpeaking};
}
