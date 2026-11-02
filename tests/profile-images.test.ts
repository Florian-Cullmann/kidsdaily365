import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropRectangle, maxImageBytes } from "@/domain/profile-image";
import { encodeProfileImage } from "@/server/profile-images";
import { boundedBytes } from "@/server/http";

describe("profile image sanitization", () => {
  it("honors the selected crop and emits only 512px WebP pixels without EXIF", async () => {
    const input = await sharp({ create: { width: 200, height: 100, channels: 3, background: "red" } })
      .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).png().toBuffer(), left: 100, top: 0 }])
      .jpeg().withExif({ IFD0: { Artist: "Private test metadata" } }).toBuffer();
    const output = await encodeProfileImage(input, { x: 100, y: 50, zoom: 1 });
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(metadata.icc).toBeUndefined();
    expect(output.includes(Buffer.from("Private test metadata"))).toBe(false);
    const { channels } = await sharp(output).stats();
    expect(channels[2].mean).toBeGreaterThan(240); expect(channels[0].mean).toBeLessThan(15);
    expect(cropRectangle(200, 100, { x: 100, y: 0, zoom: 2 })).toEqual({ left: 150, top: 0, width: 50, height: 50 });
  });
  it("applies orientation before the crop", async () => {
    const input = await sharp({ create: { width: 200, height: 100, channels: 3, background: "red" } })
      .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).png().toBuffer(), left: 100, top: 0 }])
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const output = await encodeProfileImage(input, { x: 50, y: 100, zoom: 1 });
    const { channels } = await sharp(output).stats();
    expect(channels[2].mean).toBeGreaterThan(240);
    expect((await sharp(output).metadata()).orientation).toBeUndefined();
  });
  it("rejects disguised files, corrupt images, excessive bytes/pixels, and invalid crops", async () => {
    for (const input of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('GIF89a'), Buffer.from([255, 216, 255, 0])]) {
      await expect(encodeProfileImage(input, {})).rejects.toMatchObject({ status: 400 });
    }
    await expect(encodeProfileImage(Buffer.alloc(maxImageBytes + 1), {})).rejects.toMatchObject({ status: 413 });
    const large = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: "white" } }).png().toBuffer();
    await expect(encodeProfileImage(large, {})).rejects.toMatchObject({ status: 400 });
    await expect(encodeProfileImage(Buffer.from('test'), { zoom: 0 })).rejects.toThrow();
  });
  it("limits streamed uploads even when Content-Length is absent or dishonest", async () => {
    const request = new Request("http://localhost", { method: "PUT", headers: { "Content-Length": "1" }, body: "12345" });
    await expect(boundedBytes(request, 4)).rejects.toThrow("Body too large");
  });
});
