import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { cropRectangle, imageCropSchema, maxImageBytes, maxImagePixels, profileImageUrl } from "@/domain/profile-image";
import { db } from "./db/client";
import { children, childImages } from "./db/schema";
import { ApiError } from "./errors";
import type { ParentActor } from "./auth/parent";

let processing = 0;
export async function encodeProfileImage(input: Buffer, cropInput: unknown): Promise<Buffer> {
  const crop = imageCropSchema.parse(cropInput);
  if (!input.length || input.length > maxImageBytes) throw new ApiError("Das Bild darf höchstens 8 MB groß sein.", 413);
  if (processing >= 2) throw new ApiError("Es werden gerade Bilder verarbeitet. Bitte kurz warten.", 429);
  processing++;
  try {
    const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
    const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp) throw new ApiError("Bitte ein JPEG-, PNG- oder WebP-Bild auswählen.", 400);
    const options = { limitInputPixels: maxImagePixels, failOn: "warning" as const };
    const metadata = await sharp(input, options).metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
      throw new ApiError("Bitte ein unbewegtes JPEG-, PNG- oder WebP-Bild auswählen.", 400);
    }
    // Decode and apply EXIF orientation before cropping. Re-encoding raw pixels
    // prevents all original EXIF, GPS, XMP and other metadata from surviving.
    const { data, info } = await sharp(input, options).autoOrient().raw().timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    return await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .extract(cropRectangle(info.width, info.height, crop)).resize(512, 512)
      .webp({ quality: 85 }).timeout({ seconds: 10 }).toBuffer();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Das Bild ist beschädigt, zu groß oder nicht lesbar. Erlaubt sind JPEG, PNG und WebP mit höchstens 20 Megapixeln.", 400);
  } finally { processing--; }
}

export async function requireImageChild(familyId: string, childId: string) {
  const [child] = await db().select({ id: children.id }).from(children).where(and(
    eq(children.id, childId), eq(children.familyId, familyId), eq(children.active, true),
  ));
  if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
}

export async function saveProfileImage(parent: ParentActor, childId: string, input: Buffer, crop: unknown) {
  await requireImageChild(parent.familyId, childId);
  const data = await encodeProfileImage(input, crop);
  return db().transaction(async (tx) => {
    const [child] = await tx.select({ id: children.id }).from(children).where(and(
      eq(children.id, childId), eq(children.familyId, parent.familyId), eq(children.active, true),
    )).for("update");
    if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
    const version = randomUUID();
    await tx.insert(childImages).values({ childId, familyId: parent.familyId, version, data })
      .onConflictDoUpdate({ target: childImages.childId, set: { version, data } });
    return { imageUrl: profileImageUrl(childId, version) };
  });
}

export async function removeProfileImage(parent: ParentActor, childId: string) {
  return db().transaction(async (tx) => {
    const [child] = await tx.select({ id: children.id }).from(children).where(and(
      eq(children.id, childId), eq(children.familyId, parent.familyId), eq(children.active, true),
    )).for("update");
    if (!child) throw new ApiError("Aktives Kinderprofil nicht gefunden.", 404);
    await tx.delete(childImages).where(and(eq(childImages.childId, childId), eq(childImages.familyId, parent.familyId)));
    return { imageUrl: null };
  });
}

export async function readProfileImage(familyId: string, childId: string) {
  const [image] = await db().select({ data: childImages.data }).from(childImages)
    .innerJoin(children, and(eq(children.id, childImages.childId), eq(children.familyId, childImages.familyId)))
    .where(and(eq(childImages.familyId, familyId), eq(childImages.childId, childId), eq(children.active, true)));
  if (!image) throw new ApiError("Profilbild nicht gefunden.", 404);
  return image.data;
}
