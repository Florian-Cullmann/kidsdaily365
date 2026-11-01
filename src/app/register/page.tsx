import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { appMode } from "@/server/config";
import { currentParent, hasParents } from "@/server/auth/parent";

export const dynamic = "force-dynamic";
export default async function Register() {
  const demo = appMode() === "demo";
  if (!demo && await currentParent()) redirect("/eltern");
  return <AuthForm mode="register" firstParent={demo || !await hasParents()} demo={demo} />;
}
