import { describe, expect, it } from "vitest";
import { equalSecrets, sessionLifetimeSeconds, signSession, verifySession } from "@/server/auth/token";

const family = "11111111-1111-4111-8111-111111111111";
const secret = "test-only-secret-with-at-least-32-characters";
const now = Date.parse("2026-11-01T12:00:00Z");

describe("device sessions", () => {
  it("verifies a signed, unexpired family session", () => {
    expect(verifySession(signSession(family, secret, now), family, secret, now)).toBe(true);
  });
  it("rejects tampering, different families and rotated secrets", () => {
    const token = signSession(family, secret, now);
    expect(verifySession(`${token}x`, family, secret, now)).toBe(false);
    expect(verifySession(token, "22222222-2222-4222-8222-222222222222", secret, now)).toBe(false);
    expect(verifySession(token, family, `${secret}-rotated`, now)).toBe(false);
    expect(verifySession(token.replace(/\.\d+\./, ".9999999999."), family, secret, now)).toBe(false);
  });
  it("expires exactly at the session boundary", () => {
    const token = signSession(family, secret, now);
    expect(verifySession(token, family, secret, now + sessionLifetimeSeconds * 1000 - 1000)).toBe(true);
    expect(verifySession(token, family, secret, now + sessionLifetimeSeconds * 1000)).toBe(false);
  });
  it("handles malformed tokens and different-length codes", () => {
    for (const value of ["", ".", "a.b.c", `${family}.NaN.signature`]) expect(verifySession(value, family, secret, now)).toBe(false);
    expect(equalSecrets("abc", "abcd")).toBe(false);
    expect(equalSecrets("abc", "abc")).toBe(true);
  });
});
