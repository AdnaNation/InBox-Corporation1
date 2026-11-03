"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Users, MessageSquare, Send, Settings, CreditCard,
  LogOut, Menu, X, MessageCircle, Plug, BarChart3
} from "lucide-react";

const links = [
  {href:"/dashboard",label:"Overview",icon:LayoutDashboard},
  {href:"/dashboard/contacts",label:"Contacts",icon:Users},
  {href:"/dashboard/campaigns",label:"Campaigns",icon:Send},
  {href:"/dashboard/inbox",label:"Inbox",icon:MessageSquare},
  {href:"/dashboard/whatsapp",label:"WhatsApp",icon:Plug},
  {href:"/dashboard/analytics",label:"Analytics",icon:BarChart3},
  {href:"/dashboard/billing",label:"Billing",icon:CreditCard},
  {href:"/dashboard/settings",label:"Settings",icon:Settings}
];

export default function DashboardShell({session,children}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open,setOpen] = useState(false);
  async function logout() {
    const response = await fetch("/api/auth/logout",{method:"POST"});
    if (response.ok) { router.replace("/login"); router.refresh(); }
  }
  const sidebar = <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
    <Link href="/dashboard" className="flex h-16 items-center gap-2 border-b border-slate-100 px-6 text-lg font-bold"><span className="rounded-lg bg-green-600 p-2 text-white"><MessageCircle size={19}/></span>Wavo</Link>
    <div className="px-4 py-5"><p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Workspace</p><div className="rounded-xl bg-slate-50 px-3 py-3"><p className="truncate text-sm font-semibold">{session.workspace.name}</p><p className="mt-1 text-xs capitalize text-slate-500">{session.membership.role}</p></div></div>
    <nav className="flex-1 space-y-1 px-3">{links.map(({href,label,icon:Icon})=>{const active=pathname===href || (href!=="/dashboard" && pathname.startsWith(href));return <Link key={href} href={href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active?"bg-green-50 text-green-700":"text-slate-600 hover:bg-slate-50"}`}><Icon size={18}/>{label}</Link>;})}</nav>
    <div className="border-t border-slate-100 p-4"><div className="mb-3 flex items-center gap-3 px-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">{session.user.name.slice(0,1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{session.user.name}</p><p className="truncate text-xs text-slate-500">{session.user.email}</p></div></div><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"><LogOut size={17}/>Sign out</button></div>
  </aside>;
  return <div className="min-h-screen lg:flex"><div className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden"><Link href="/dashboard" className="flex items-center gap-2 font-bold"><MessageCircle className="text-green-600"/>Wavo</Link><button onClick={()=>setOpen(!open)} className="rounded-lg p-2 hover:bg-slate-100">{open?<X/>:<Menu/>}</button></div><div className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</div>{open&&<div className="fixed inset-0 z-40 pt-16 lg:hidden"><button aria-label="Close navigation" onClick={()=>setOpen(false)} className="absolute inset-0 bg-slate-950/30"/><div className="relative h-full w-72">{sidebar}</div></div>}<main className="min-w-0 flex-1 pt-16 lg:ml-64 lg:pt-0">{children}</main></div>;
}
