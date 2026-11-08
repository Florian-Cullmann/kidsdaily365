import { redirect } from "next/navigation";
import { appMode } from "@/server/config";
import { currentParent } from "@/server/auth/parent";
import { getManagementData } from "@/server/management";
import { ParentConsole } from "@/components/parent-console";

export const dynamic = "force-dynamic";
export default async function Parents({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; child?: string | string[] }> }) {
  if (appMode() === "demo") redirect("/login");
  const parent = await currentParent();
  if (!parent) redirect("/login");
  const query = await searchParams;
  const childId = Array.isArray(query.child) ? query.child[0] : query.child;
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  return <ParentConsole key={`${parent.familyId}-${parent.id}`} parent={parent} initialData={await getManagementData(parent, childId)} initialTab={tab} />;
}
