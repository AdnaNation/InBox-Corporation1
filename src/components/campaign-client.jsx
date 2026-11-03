"use client";

import { useState } from "react";
import { Send, AlertCircle, Loader2 } from "lucide-react";

export default function CampaignClient({contactCount,connected,campaigns}) {
  const [form,setForm]=useState({contactId:"",templateName:"",language:"en_US",parameters:""});
  const [result,setResult]=useState("");
  const [loading,setLoading]=useState(false);
  return <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
    <form onSubmit={async e=>{e.preventDefault();setLoading(true);setResult("");try{const r=await fetch("/api/campaigns/send-template",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,parameters:form.parameters?form.parameters.split(",").map(v=>v.trim()):[]})});const d=await r.json();setResult(d.message||"Request complete.");}catch{setResult("Network error.");}finally{setLoading(false);}}} className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Send a template message</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">This MVP sends one approved template to one opted-in contact. Bulk campaigns and scheduling are not enabled yet.</p>
      {(!connected||contactCount===0)&&<div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertCircle size={17} className="shrink-0"/>{!connected?"Connect WhatsApp before sending.":"Add opted-in contacts before sending."}</div>}
      <label className="mt-5 block text-sm font-medium">Contact ID<input required value={form.contactId} onChange={e=>setForm({...form,contactId:e.target.value})} placeholder="MongoDB contact ID" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"/></label>
      <label className="mt-4 block text-sm font-medium">Approved template name<input required value={form.templateName} onChange={e=>setForm({...form,templateName:e.target.value})} placeholder="hello_world" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"/></label>
      <label className="mt-4 block text-sm font-medium">Language code<input required value={form.language} onChange={e=>setForm({...form,language:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"/></label>
      <label className="mt-4 block text-sm font-medium">Body parameters (comma separated)<input value={form.parameters} onChange={e=>setForm({...form,parameters:e.target.value})} placeholder="John, Order 123" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"/></label>
      <button disabled={loading||!connected||contactCount===0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading?<Loader2 size={17} className="animate-spin"/>:<Send size={17}/>}Send template</button>
      {result&&<p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{result}</p>}
    </form>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Recent campaigns</h2><p className="mt-1 text-xs text-slate-500">Campaign history will appear here as campaign scheduling is added.</p>{campaigns.length?<div className="mt-5 divide-y divide-slate-100">{campaigns.map(c=><div key={c.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-slate-400">{c.createdAt?new Date(c.createdAt).toLocaleString():""}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{c.status}</span></div>)}</div>:<div className="py-16 text-center text-sm text-slate-400">No campaigns yet.</div>}</section>
  </div>;
}
