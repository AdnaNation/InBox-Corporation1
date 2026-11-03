import {redirect} from "next/navigation";
import {getSession} from "@/lib/auth";
import TeamClient from "@/components/team-client";

export const dynamic="force-dynamic";
export default async function TeamPage(){
  const session=await getSession();
  if(!session) redirect("/login");
  if(!["owner","admin"].includes(session.membership.role)) redirect("/dashboard");
  return <TeamClient currentRole={session.membership.role}/>;
}
