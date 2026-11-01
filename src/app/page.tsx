import { Dashboard } from "@/components/dashboard";
import { PairDevice } from "@/components/pair-device";
import { demoPlans } from "@/domain/demo";
import { appMode } from "@/server/config";
import { currentWall } from "@/server/devices";
import { currentParent, hasParents } from "@/server/auth/parent";
import { ExitParentMode } from "@/components/exit-parent-mode";
import { getDayPlans } from "@/server/plans";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (appMode() === "demo") return <Dashboard initialPlans={demoPlans()} demo />;
  if (await currentParent()) return <ExitParentMode />;
  const device = await currentWall();
  if (!device) return <PairDevice initialSetup={!await hasParents()} />;
  return <Dashboard initialPlans={await getDayPlans(device.familyId)} demo={false} />;
}
