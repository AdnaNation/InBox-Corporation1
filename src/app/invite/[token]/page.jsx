"use client";

import {useState} from "react";
import Link from "next/link";
import {useParams,useRouter} from "next/navigation";
import {MessageCircle,Loader2,CheckCircle2} from "lucide-react";

export default function AcceptInvitePage(){
  const {token}=useParams();
  const router=useRouter();
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [success,setSuccess]=useState(false);
  async function accept(){
    setLoading(true);setMessage("");
    try{
      const response=await fetch("/api/workspace/invitations/accept",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})
      });
      const data=await response.json();
      if(!response.ok){setMessage(data.message||"Could not accept invitation.");return;}
      setSuccess(true);setMessage(data.message||"Invitation accepted.");
    }catch{setMessage("Unable to accept this invitation. Please try again.");}
    finally{setLoading(false);}
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700"><MessageCircle size={28}/></div>
    <h1 className="text-2xl font-bold">Join a workspace</h1>
    <p className="mt-2 text-sm text-slate-500">Accept this invitation using the account registered with the invited email address.</p>
    {message&&<p className={`mt-5 rounded-xl p-3 text-sm ${success?"bg-green-50 text-green-800":"bg-amber-50 text-amber-800"}`}>{message}</p>}
    {success?<button onClick={()=>router.replace("/dashboard")} className="mt-6 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white">Go to dashboard</button>:<button onClick={accept} disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading?<><Loader2 size={18} className="animate-spin"/>Accepting...</>:"Accept invitation"}</button>}
    <p className="mt-5 text-sm text-slate-500">Not signed in? <Link href="/login" className="font-semibold text-green-700">Sign in</Link> or <Link href="/register" className="font-semibold text-green-700">create an account</Link>, then return to this link.</p>
  </div></main>;
}
