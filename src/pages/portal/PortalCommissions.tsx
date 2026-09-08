import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { usePortalCommand, usePortalMembers } from "@/hooks/usePortal";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const statuses = ["projected","accrued","under_review","approved","scheduled","paid","reversed","disputed","void"] as const;
type Entry = {id:string;ambassador_id:string;title:string;kind:string;amount_cents:number;status:string;plan_reference:string;notes:string;payment_date:string|null;payment_reference:string;version:number};
const blank = {ambassador_id:"",title:"",kind:"direct",amount:"",status:"projected",plan_reference:"",notes:"",payment_date:"",payment_reference:"",reason:""};
export default function PortalCommissions({org,admin,preview}:{org:string;admin:boolean;preview:boolean}) {
 const {user}=useAuth(); const {language}=useLanguage(); const es=language==="es";
 const label=(en:string,sp:string)=>es?sp:en;
 const names:Record<string,string>={projected:label("Projected","Proyectada"),accrued:label("Accrued","Acumulada"),under_review:label("Under review","En revisión"),approved:label("Approved","Aprobada"),scheduled:label("Scheduled","Programada"),paid:label("Paid","Pagada"),reversed:label("Reversed","Revertida"),disputed:label("Disputed","En disputa"),void:label("Void","Anulada")};
 const command=usePortalCommand(); const members=usePortalMembers(org,admin&&!preview);
 const [page,setPage]=useState(0),[filter,setFilter]=useState("");
 const [editing,setEditing]=useState<Entry|null>(null),[open,setOpen]=useState(false),[form,setForm]=useState(blank),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const query=useQuery({queryKey:["portal",user?.id,org,"commissions",page,filter],enabled:!!user&&!preview,queryFn:async()=>{
  let q=(supabase as any).from("portal_commissions").select("*",{count:"exact"}).eq("org_id",org).order("created_at",{ascending:false}).order("id").range(page*20,page*20+19);
  if(filter) q=q.eq("status",filter);
  const {data,error,count}=await q;if(error)throw error;return {rows:data as Entry[],count:count as number};
 }});
 const rows=preview?[]:query.data?.rows??[];
 const money=(c:number)=>new Intl.NumberFormat(language,{style:"currency",currency:"USD"}).format(c/100);
 const start=(e?:Entry)=>{setEditing(e??null);setForm(e?{...blank,...e,amount:(e.amount_cents/100).toFixed(2),payment_date:e.payment_date??"",reason:""}:blank);setError("");setOpen(true);};
 const save=async(e:FormEvent)=>{e.preventDefault();if(preview||busy)return;setError("");
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(form.amount)){setError(label("Enter a USD amount with at most two decimals.","Ingresa un monto USD con hasta dos decimales."));return;}
  const [whole,fraction=""]=form.amount.split(".");const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  setBusy(true);try{await command("portal_save_commission",{p_org:org,p_id:editing?.id??null,p_version:editing?.version??null,p_record:{ambassador_id:form.ambassador_id,title:form.title,kind:form.kind,amount_cents:cents,status:form.status,plan_reference:form.plan_reference,notes:form.notes,payment_date:form.payment_date,payment_reference:form.payment_reference,reason:form.reason}});setOpen(false);}catch{setError(label("Could not save. Refresh the records and check the recipient, required fields and version. Final records cannot be edited.","No se pudo guardar. Actualiza y revisa el destinatario, campos y versión. Los registros finales no se pueden editar."));}finally{setBusy(false);}
 };
 const field=(key:keyof typeof blank,en:string,sp:string,required=false,type="text")=><label className="grid gap-2 text-sm">{label(en,sp)}<Input type={type} required={required} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} maxLength={key==="reason"?1000:250}/></label>;
 return <section className="space-y-5">
 <div className="flex flex-wrap justify-between gap-3"><h1 className="text-3xl font-semibold">{label("Commissions","Comisiones")}</h1>{admin&&<Button onClick={()=>start()}>{label("Add commission","Agregar comisión")}</Button>}</div>
 <p className="text-sm text-muted-foreground">{label("Admin-recorded USD amounts. Projected is an estimate, not yet earned. Accrued is based on cleared eligible payments and remains pending approval. Recording a payment here does not transfer funds.","Montos USD registrados por administración. Proyectada es una estimación aún no ganada. Acumulada corresponde a pagos elegibles recibidos y está pendiente de aprobación. Registrar un pago aquí no transfiere fondos.")}</p>
 {open&&admin&&<form onSubmit={save} className="rounded-xl border bg-white p-5 grid sm:grid-cols-2 gap-4">
 <label className="grid gap-2 text-sm">{label("Ambassador","Embajador")}<select className="border rounded-md p-2" required disabled={!!editing} value={form.ambassador_id} onChange={e=>setForm({...form,ambassador_id:e.target.value})}><option value="">{label("Select representative","Selecciona representante")}</option>{members.data?.filter(m=>m.role!=="staff"&&m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
 {field("title","Opportunity / reference","Oportunidad / referencia",true)}
 {field("amount","Commission amount (USD)","Monto de comisión (USD)",true)}
 {field("plan_reference","Agreement / approved plan reference","Referencia de acuerdo / plan aprobado",true)}
 <label className="grid gap-2 text-sm">{label("Type","Tipo")}<select className="border rounded-md p-2" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="direct">{label("Direct","Directa")}</option><option value="connection">{label("Connection","Conexión")}</option></select></label>
 <label className="grid gap-2 text-sm">{label("Status","Estado")}<select className="border rounded-md p-2" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(s=><option key={s} value={s}>{names[s]}</option>)}</select></label>
 {field("payment_date","Scheduled / paid date","Fecha programada / pagada",["scheduled","paid"].includes(form.status),"date")}
 {field("payment_reference","Payment reference (visible to ambassador)","Referencia de pago (visible al embajador)",form.status==="paid")}
 <label className="grid gap-2 text-sm">{label("Shared explanation","Explicación compartida")}<Textarea value={form.notes} maxLength={4000} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
 {field("reason","Audit reason (admin only)","Motivo de auditoría (solo admin)",true)}
 <p className="sm:col-span-2 text-xs text-muted-foreground">{label("Verify the amount against the agreement and accounting records. Do not include bank details, private margins or other ambassadors' information.","Verifica el monto con el acuerdo y los registros contables. No incluyas datos bancarios, márgenes privados ni información de otros embajadores.")}</p>
 {error&&<p role="alert" className="text-destructive sm:col-span-2">{error}</p>}
 <div className="flex gap-2"><Button disabled={preview||busy} type="submit">{label("Save record","Guardar registro")}</Button><Button disabled={busy} type="button" variant="outline" onClick={()=>setOpen(false)}>{label("Cancel","Cancelar")}</Button></div>
 </form>}
 <div className="flex gap-3"><select aria-label={label("Filter status","Filtrar estado")} className="border rounded-md p-2" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="">{label("All statuses","Todos los estados")}</option>{statuses.map(s=><option key={s} value={s}>{names[s]}</option>)}</select><Button variant="outline" disabled={preview} onClick={()=>void query.refetch()}>{label("Refresh","Actualizar")}</Button></div>
 {query.isError?<p role="alert">{label("Commission records are unavailable. Try refreshing; the tracker migration may need deployment.","Los registros no están disponibles. Actualiza; puede faltar desplegar la migración.")}</p>:query.isLoading&&!preview?<p>{label("Loading…","Cargando…")}</p>:!rows.length?<p className="rounded-xl border bg-white p-8">{label("No commission records yet.","Aún no hay registros de comisiones.")}</p>:rows.map(row=><article key={row.id} className="rounded-xl border bg-white p-5 space-y-3">
 <div className="flex justify-between gap-3"><h2 className="font-semibold">{row.title}</h2><strong>{money(row.amount_cents)}</strong></div>
 <p>{names[row.status]} · {row.kind==="direct"?label("Direct","Directa"):label("Connection","Conexión")}</p>
 {admin&&<p>{members.data?.find(m=>m.user_id===row.ambassador_id)?.display_name??label("Representative","Representante")}</p>}
 <p className="text-sm">{label("Plan reference","Referencia de plan")}: {row.plan_reference}</p>
 {row.notes&&<p className="whitespace-pre-wrap text-sm">{row.notes}</p>}
 {row.payment_date&&<p>{label("Scheduled / paid date","Fecha programada / pagada")}: {row.payment_date}</p>}
 {row.payment_reference&&<p>{label("Payment reference","Referencia de pago")}: {row.payment_reference}</p>}
 {admin&&!["paid","reversed","void"].includes(row.status)&&<Button variant="outline" onClick={()=>start(row)}>{label("Edit record","Editar registro")}</Button>}
 </article>)}
 <div className="flex gap-3"><Button variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>{label("Previous","Anterior")}</Button><Button variant="outline" disabled={(page+1)*20>=(query.data?.count??0)} onClick={()=>setPage(page+1)}>{label("Next","Siguiente")}</Button></div>
 </section>;
}
