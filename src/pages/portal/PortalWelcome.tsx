import { useEffect, useState, type CSSProperties } from "react";
import LVLogo from "@/components/LVLogo";
import { supabase } from "@/integrations/supabase/client";

// Share the claim promise across React StrictMode remounts. The DB enforces once across devices.
const claims=new Map<string,Promise<boolean>>();
export default function PortalWelcome({userId,org,role,preview}:{userId:string;org:string;role:string;preview:boolean}) {
 const [celebrate,setCelebrate]=useState(false);
 useEffect(()=>{
  if(preview||!["ambassador","business_developer"].includes(role))return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const key=userId+":"+org;
  if(!claims.has(key))claims.set(key,(async()=>{
   const {data,error}=await (supabase as any).rpc("portal_claim_welcome",{p_org:org});
   if(error){claims.delete(key);return false;}
   return data===true;
  })());
  void claims.get(key)!.then(show=>{
   if(cancelled)return;
   claims.set(key,Promise.resolve(false));
   if(!show||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
   setCelebrate(true);timer=setTimeout(()=>setCelebrate(false),4500);
  });
  return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[userId,org,role,preview]);
 if(!celebrate)return null;
 return <div aria-hidden="true" className="lv-welcome-confetti fixed inset-0 z-50 overflow-hidden pointer-events-none">
  <style>{`@keyframes lv-welcome-fall {0%{transform:translate3d(0,-12vh,0) rotate(0deg);opacity:0}10%{opacity:1}85%{opacity:1}100%{transform:translate3d(var(--drift),112vh,0) rotate(var(--spin));opacity:0}}.lv-welcome-piece{position:absolute;top:-60px;animation:lv-welcome-fall 3.5s ease-in both}@media(prefers-reduced-motion:reduce){.lv-welcome-confetti{display:none}}`}</style>
  {Array.from({length:32},(_,i)=><span key={i} className="lv-welcome-piece" style={{left:`${(i*37)%100}%`,animationDelay:`${(i%7)*0.12}s`,"--drift":`${(i%2?1:-1)*(20+i%5*12)}px`,"--spin":`${(i%2?1:-1)*(120+i*17)}deg`} as CSSProperties}><LVLogo size={16+(i%5)*9}/></span>)}
 </div>;
}
