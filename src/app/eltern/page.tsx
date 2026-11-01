import { redirect } from "next/navigation";
import { appMode } from "@/server/config";
import { currentParent } from "@/server/auth/parent";
import { getManagementData } from "@/server/management";
import { ParentConsole } from "@/components/parent-console";

export const dynamic = "force-dynamic";
export default async function Parents() {
  if (appMode() === "demo") redirect("/login");
  const parent = await currentParent();
  if (!parent) redirect("/login");
  return <ParentConsole parent={parent} initialData={await getManagementData(parent)} />;
}
