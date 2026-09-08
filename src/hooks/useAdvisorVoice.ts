import { useCallback, useEffect, useRef, useState } from "react";

interface Recognition {
 lang:string; continuous:boolean; interimResults:boolean;
 onresult:((event:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;
 onend:(()=>void)|null;
 start():void; abort():void;
}
type VoiceWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};

export function speechText(text:string) {
 return text.replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/https?:\/\/\S+/g,"").replace(/[*_`#>|]/g,"").trim();
}
export function useAdvisorVoice(language:string,active:boolean,onTranscript:(text:string)=>void) {
 const recognition=useRef<Recognition|null>(null),utterance=useRef<SpeechSynthesisUtterance|null>(null);
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
  const u=utterance.current;utterance.current=null;
  if(u){u.onend=null;u.onerror=null;window.speechSynthesis.cancel();}
  setSpeaking(false);
 },[]);
 const stop=useCallback(()=>{stopListening();stopSpeaking();},[stopListening,stopSpeaking]);
 useEffect(()=>{stop();setError("");return stop;},[active,language,stop]);
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
 const speak=(text:string)=>{
  if(!canSpeak||!active)return;
  stop();setError("");
  const clean=speechText(text);if(!clean)return;
  const u=new SpeechSynthesisUtterance(clean);utterance.current=u;
  u.lang=language==="es"?"es-US":"en-US";
  const voices=window.speechSynthesis.getVoices();
  u.voice=voices.find(v=>v.lang===u.lang)??voices.find(v=>v.lang.startsWith(language))??null;
  u.onend=()=>{if(utterance.current===u){utterance.current=null;setSpeaking(false);}};
  u.onerror=()=>{if(utterance.current===u){utterance.current=null;setSpeaking(false);setError("voicePlaybackError");}};
  try{window.speechSynthesis.speak(u);setSpeaking(true);}catch{stopSpeaking();setError("voicePlaybackError");}
 };
 return {canListen:!!Constructor,canSpeak,listening,speaking,error,listen,speak,stop,stopListening,stopSpeaking};
}
