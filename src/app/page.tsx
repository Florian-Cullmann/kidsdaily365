import { Dashboard } from "@/components/dashboard";
import { PairDevice } from "@/components/pair-device";
import { demoPlans } from "@/domain/demo";
import { appMode, liveConfig } from "@/server/config";
import { isPaired } from "@/server/auth/device";
import { getDayPlans } from "@/server/plans";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (appMode() === "demo") return <Dashboard initialPlans={demoPlans()} demo />;
  if (!await isPaired()) return <PairDevice />;
  return <Dashboard initialPlans={await getDayPlans(liveConfig().FAMILY_ID)} demo={false} />;
}
