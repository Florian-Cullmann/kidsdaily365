import { NextResponse } from "next/server";
import { z } from "zod";
import { appMode, liveConfig } from "@/server/config";
import { isPaired, trustedOrigin } from "@/server/auth/device";
import { completeTask, getDayPlans, PlanError } from "@/server/plans";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  if (appMode() === "demo") return NextResponse.json({ error: "Im Demo-Modus nicht verfügbar." }, { status: 409 });
  if (!trustedOrigin(request)) return NextResponse.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  if (!await isPaired()) return NextResponse.json({ error: "Bitte das Gerät erneut freigeben." }, { status: 401 });
  const { taskId } = await context.params;
  if (!z.uuid().safeParse(taskId).success) return NextResponse.json({ error: "Ungültige Aufgabe." }, { status: 400 });
  try {
    const familyId = liveConfig().FAMILY_ID;
    const result = await completeTask(familyId, taskId);
    const plans = await getDayPlans(familyId);
    return NextResponse.json({ ...result, plan: plans.find((plan) => plan.child.id === result.childId) });
  } catch (error) {
    if (error instanceof PlanError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Task completion failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Speichern hat gerade nicht geklappt. Bitte erneut versuchen." }, { status: 503 });
  }
}
