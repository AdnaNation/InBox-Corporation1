"use client";

import { useState } from "react";
import { Plus, Search, Users, Loader2 } from "lucide-react";

export default function ContactsClient({initialContacts}) {
  const [contacts,setContacts] = useState(initialContacts);
  const [search,setSearch] = useState("");
  const [form,setForm] = useState({name:"",phone:"",optedIn:false});
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");

  async function addContact(event) {
    event.preventDefault();
    setLoading(true);setError("");
    try {
      const response = await fetch("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const data = await response.json();
      if(!response.ok) {setError(data.message||"Could not add contact.");return;}
      setContacts(current=>[data.contact,...current]);setForm({name:"",phone:"",optedIn:false});
    } catch {setError("Network error. Please retry.");}
    finally {setLoading(false);}
  }

  async function removeContact(id) {
    if(!confirm("Delete this contact?")) return;
    const response = await fetch(`/api/contacts/${id}`,{method:"DELETE"});
    if(response.ok) setContacts(current=>current.filter(item=>item.id!==id));
  }

  const filtered = contacts.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
    <form onSubmit={addContact} className="h-fit rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-center gap-2"><Plus className="text-green-600" size={19}/><h2 className="font-semibold">Add contact</h2></div>{error&&<p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<label className="mb-4 block text-sm font-medium">Name<input required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"/></label><label className="mb-4 block text-sm font-medium">Phone number<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="8801XXXXXXXXX" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"/><span className="mt-1 block text-xs font-normal text-slate-400">Use international format, without spaces.</span></label><label className="mb-5 flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={form.optedIn} onChange={e=>setForm({...form,optedIn:e.target.checked})} className="mt-1 accent-green-600"/><span>I confirm this contact has explicitly opted in to receive WhatsApp messages from this business.</span></label><button disabled={loading||!form.optedIn} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">{loading?<Loader2 className="animate-spin" size={17}/>:<Plus size={17}/>}Add contact</button></form>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-semibold">All contacts</h2><p className="mt-1 text-xs text-slate-500">{contacts.length} contacts loaded (latest 200)</p></div><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts..." className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-green-500 sm:w-56"/></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">Name</th><th className="px-5 py-3 font-medium">Phone</th><th className="px-5 py-3 font-medium">Consent</th><th className="px-5 py-3 font-medium">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(c=><tr key={c.id}><td className="px-5 py-4 font-medium">{c.name}</td><td className="px-5 py-4 text-slate-500">{c.phone}</td><td className="px-5 py-4"><span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">Opted in</span></td><td className="px-5 py-4"><button onClick={()=>removeContact(c.id)} className="text-xs font-medium text-red-600 hover:underline">Delete</button></td></tr>)}</tbody></table>{filtered.length===0&&<div className="p-12 text-center text-sm text-slate-400"><Users className="mx-auto mb-3" size={25}/>No contacts found.</div>}</div></section>
  </div>;
}
