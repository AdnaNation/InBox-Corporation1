"use client";

import { useState } from "react";
import { Plug, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

export default function WhatsAppPage() {
  const [form,setForm]=useState({phoneNumberId:"",wabaId:"",displayPhoneNumber:"",businessName:"",accessToken:""});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  async function submit(e) {
    e.preventDefault();setLoading(true);setMessage("");
    try {
      const response=await fetch("/api/whatsapp/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const data=await response.json();setMessage(data.message||"Request complete.");
      if(response.ok)setForm({phoneNumberId:"",wabaId:"",displayPhoneNumber:"",businessName:"",accessToken:""});
    } catch {setMessage("Network error.");}
    finally {setLoading(false);}
  }
  return <div className="mx-auto max-w-3xl p-5 sm:p-8"><div className="mb-7"><h1 className="text-2xl font-bold">WhatsApp connection</h1><p className="mt-1 text-sm text-slate-500">Connect a WhatsApp Business Platform Cloud API account.</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18}/>Developer setup required</div><p className="mt-1">This starter uses manually supplied Cloud API credentials. For a public SaaS, implement Meta Embedded Signup and token lifecycle management before onboarding customers.</p></div><form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-green-50 p-3 text-green-700"><Plug/></span><div><h2 className="font-semibold">Cloud API credentials</h2><p className="text-xs text-slate-500">Credentials are encrypted before being stored.</p></div></div>{[["businessName","Business name"],["wabaId","WhatsApp Business Account ID"],["phoneNumberId","Phone Number ID"],["displayPhoneNumber","Display phone number"],["accessToken","Permanent/system-user access token"]].map(([key,label])=><label key={key} className="mb-4 block text-sm font-medium">{label}<input required type={key==="accessToken"?"password":"text"} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"/></label>)}<button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50">{loading?<Loader2 className="animate-spin"/>:<ShieldCheck size={18}/>}Save WhatsApp account</button>{message&&<p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">{message}</p>}</form></div>;
}
