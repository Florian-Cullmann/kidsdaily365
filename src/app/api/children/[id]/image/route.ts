import { z } from "zod";
import { api, ensureBrowserOrigin, ensureLive, rateLimit } from "@/server/api";
import { currentParent, requireParent } from "@/server/auth/parent";
import { requireLauncher, requireWall } from "@/server/devices";
import { ApiError } from "@/server/errors";
import { boundedBytes } from "@/server/http";
import { maxImageBytes, imageCropSchema } from "@/domain/profile-image";
import { readProfileImage, removeProfileImage, requireImageChild, saveProfileImage } from "@/server/profile-images";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const imageHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
async function privateApi(action: () => Promise<Response>) {
  const response = await api(action);
  for (const [key, value] of Object.entries(imageHeaders)) response.headers.set(key, value);
  return response;
}
export async function GET(request: Request, context: Context) {
  return privateApi(async () => {
    ensureLive();
    const id = z.uuid().parse((await context.params).id);
    let familyId: string;
    if (request.headers.has("authorization")) {
      const device = await requireLauncher(request);
      if (device.childId !== id) throw new ApiError("Dieses Profilbild gehört zu einem anderen Kind.", 403);
      familyId = device.familyId;
    } else {
      const parent = await currentParent();
      familyId = parent?.familyId ?? (await requireWall(request)).familyId;
    }
    const bytes = await readProfileImage(familyId, id);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
  });
}
async function parentForImage(request: Request) {
  ensureBrowserOrigin(request);
  if (request.headers.has("authorization")) throw new ApiError("Android-Geräte dürfen Profilbilder nicht verändern.", 403);
  return requireParent();
}
export async function PUT(request: Request, context: Context) {
  return privateApi(async () => {
    const parent = await parentForImage(request);
    const id = z.uuid().parse((await context.params).id);
    rateLimit(`profile-image:${parent.familyId}`, 20);
    await requireImageChild(parent.familyId, id);
    const crop = imageCropSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let bytes: Buffer;
    try { bytes = await boundedBytes(request, maxImageBytes); }
    catch { throw new ApiError("Bitte ein Bild mit höchstens 8 MB hochladen.", 413); }
    return Response.json(await saveProfileImage(parent, id, bytes, crop));
  });
}
export async function DELETE(request: Request, context: Context) {
  return privateApi(async () => {
    const parent = await parentForImage(request);
    return Response.json(await removeProfileImage(parent, z.uuid().parse((await context.params).id)));
  });
}
