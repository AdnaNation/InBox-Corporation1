"use client";

import {useCallback,useEffect,useState} from "react";
import {Copy,Loader2,RefreshCw,UserPlus,Users,UserX,Clock} from "lucide-react";

export default function TeamClient({currentRole}){
  const [members,setMembers]=useState([]);
  const [activity,setActivity]=useState([]);
  const [invitations,setInvitations]=useState([]);
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("agent");
  const [inviteUrl,setInviteUrl]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [m,i]=await Promise.all([fetch("/api/workspace/members"),fetch("/api/workspace/invitations")]);
      const md=await m.json(),id=await i.json();
      if(!m.ok)throw new Error(md.message||"Could not load members.");
      if(!i.ok)throw new Error(id.message||"Could not load invitations.");
      setMembers(md.members||[]);setActivity(md.activity||[]);setInvitations(id.invitations||[]);
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  async function createInvite(e){
    e.preventDefault();setSaving(true);setError("");setNotice("");setInviteUrl("");
    try{
      const response=await fetch("/api/workspace/invitations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||"Could not create invitation.");
      setInviteUrl(data.inviteUrl);setNotice("Invitation created. Copy and share the link within 7 days.");setEmail("");await load();
    }catch(e){setError(e.message);}
    finally{setSaving(false);}
  }
  async function changeRole(userId,nextRole){
    setError("");setNotice("");
    try{
      const response=await fetch("/api/workspace/members",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,role:nextRole})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not update member role.");
      setNotice(data.message||"Member role updated.");await load();
    }catch(e){setError(e.message);}
  }
  async function removeMember(userId){
    if(!window.confirm("Remove this person from the workspace? They will lose access to this workspace."))return;
    setError("");setNotice("");
    try{
      const response=await fetch("/api/workspace/members",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not remove member.");
      setNotice(data.message||"Member removed.");await load();
    }catch(e){setError(e.message);}
  }
  async function revoke(id){
    if(!window.confirm("Revoke this invitation? The link will stop working."))return;
    setError("");setNotice("");
    try{
      const response=await fetch("/api/workspace/invitations",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not revoke invitation.");
      setNotice("Invitation revoked.");await load();
    }catch(e){setError(e.message);}
  }
  async function copy(text){
    try{await navigator.clipboard.writeText(text);setNotice("Copied to clipboard.");}
    catch{setNotice("Copy failed. Select and copy the invitation link manually.");}
  }
  return <div className="mx-auto max-w-5xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Team</h1><p className="mt-1 text-sm text-slate-500">Invite teammates and manage workspace access.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"><RefreshCw size={15}/>Refresh</button></div>
    {error&&<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><UserPlus className="text-green-600" size={20}/><h2 className="font-semibold">Invite a teammate</h2></div>
      <p className="mt-1 text-sm text-slate-500">Create a secure link and share it yourself. Links expire after 7 days.</p>
      <form onSubmit={createInvite} className="mt-5 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="teammate@example.com" className="min-w-0 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"/>
        <select value={role} onChange={e=>setRole(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-green-500"><option value="agent">Agent</option>{currentRole==="owner"&&<option value="admin">Admin</option>}</select>
        <button disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">{saving?<Loader2 size={17} className="animate-spin"/>:<UserPlus size={17}/>}Create invite</button>
      </form>
      {inviteUrl&&<div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3"><p className="text-xs font-semibold text-green-800">Invitation link</p><div className="mt-2 flex flex-wrap items-center gap-2"><input readOnly value={inviteUrl} className="min-w-0 flex-1 rounded-lg border border-green-200 bg-white px-3 py-2 text-xs text-slate-700"/><button onClick={()=>copy(inviteUrl)} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white"><Copy size={14}/>Copy</button></div></div>}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><Users className="text-green-600" size={20}/><h2 className="font-semibold">Workspace members <span className="text-slate-400">({members.length})</span></h2></div>
      {loading?<div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Loading team...</div>:members.length===0?<p className="py-8 text-sm text-slate-500">No active members found.</p>:<div className="mt-4 divide-y divide-slate-100">{members.map(member=><div key={member.userId} className="flex items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.name}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div><div className="flex items-center gap-2">{currentRole==="owner"&&member.role!=="owner"?<select aria-label={`Role for ${member.email}`} value={member.role} onChange={e=>changeRole(member.userId,e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium capitalize"><option value="agent">Agent</option><option value="admin">Admin</option></select>:<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">{member.role}</span>}{member.role!=="owner"&&member.userId!==undefined&&<button onClick={()=>removeMember(member.userId)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>}</div></div>)}</div>}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><Clock className="text-amber-600" size={20}/><h2 className="font-semibold">Pending invitations <span className="text-slate-400">({invitations.length})</span></h2></div>
      {loading?<p className="py-6 text-sm text-slate-500">Loading invitations...</p>:invitations.length===0?<p className="py-6 text-sm text-slate-500">No pending invitations.</p>:<div className="mt-4 divide-y divide-slate-100">{invitations.map(invite=><div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{invite.email}</p><p className="mt-1 text-xs text-slate-500 capitalize">{invite.role} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div><button onClick={()=>revoke(invite.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><UserX size={14}/>Revoke</button></div>)}</div>}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><Clock className="text-slate-500" size={20}/><h2 className="font-semibold">Recent team activity</h2></div>
      {activity.length===0?<p className="py-5 text-sm text-slate-500">No team changes recorded yet.</p>:<div className="mt-3 divide-y divide-slate-100">{activity.map(item=>{const description=item.details?.from&&item.details?.to?item.details.from+" → "+item.details.to:item.details?.role?"Role: "+item.details.role:"Workspace access updated";return <div key={item.id} className="py-3"><p className="text-sm font-medium">{item.action==="member_role_changed"?"Member role changed":"Member removed"}</p><p className="mt-1 text-xs text-slate-500">{description} · {new Date(item.createdAt).toLocaleString()}</p></div>;})}</div>}
    </section>
    <p className="mt-5 text-xs leading-5 text-slate-400">Workspace owners can invite admins and agents and change member roles. Admins can invite agents. A person must sign in using the exact invited email address to accept. An accepted invitation adds the member to the workspace; they may need to sign in again to switch workspaces.</p>
  </div>;
}
