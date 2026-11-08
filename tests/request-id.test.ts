import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { newRequestId } from "@/client/request-id";

afterEach(() => vi.unstubAllGlobals());
it("uses cryptographic randomness to produce distinct UUID v4 request IDs without randomUUID", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => webcrypto.getRandomValues(bytes));
  vi.stubGlobal("crypto", { getRandomValues });
  const ids = Array.from({ length: 100 }, () => newRequestId());
  expect(new Set(ids).size).toBe(100);
  expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
  expect(getRandomValues).toHaveBeenCalledTimes(100);
});
