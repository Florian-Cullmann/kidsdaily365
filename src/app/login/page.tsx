import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { appMode } from "@/server/config";
import { currentParent } from "@/server/auth/parent";

export const dynamic = "force-dynamic";
export default async function Login() {
  const demo = appMode() === "demo";
  if (!demo && await currentParent()) redirect("/eltern");
  return <AuthForm mode="login" demo={demo} />;
}
