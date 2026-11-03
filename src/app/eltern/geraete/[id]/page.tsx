import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { appMode } from "@/server/config";
import { currentParent } from "@/server/auth/parent";
import { getDeviceManagement } from "@/server/device-management";
import { DeviceManager } from "@/components/device-manager";
import { ApiError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  if (appMode() !== "live") redirect("/login");
  const parent = await currentParent(); if (!parent) redirect("/login");
  const id = z.uuid().safeParse((await params).id); if (!id.success) notFound();
  let data;
  try { data = await getDeviceManagement(parent, id.data); }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
  return <DeviceManager initialData={data} />;
}
