import "server-only";

export async function boundedBytes(request: Request, maxBytes: number): Promise<Buffer> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function boundedJson(request: Request, maxBytes = 1024): Promise<unknown> {
  return JSON.parse((await boundedBytes(request, maxBytes)).toString("utf8"));
}
