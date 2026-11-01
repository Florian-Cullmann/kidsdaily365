import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookieState.token ? { value: cookieState.token } : undefined }) }));

const origin = "http://localhost:3000";
const familyId = "11111111-1111-4111-8111-111111111111";
const code = "test-only-long-device-pairing-code";
const secret = "test-only-long-session-signing-secret";
const pairRequest = (value: string, requestOrigin = origin) => new Request(`${origin}/api/device/pair`, {
  method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ code: value }),
});

beforeEach(() => {
  vi.resetModules();
  cookieState.token = "";
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("FAMILY_ID", familyId);
  vi.stubEnv("DATABASE_URL", "postgres://localhost/unused_test");
  vi.stubEnv("DEVICE_PAIRING_CODE", code);
  vi.stubEnv("SESSION_SECRET", secret);
});

describe("device pairing boundary", () => {
  it("rejects a foreign origin and an incorrect code", async () => {
    const { POST } = await import("@/app/api/device/pair/route");
    expect((await POST(pairRequest(code, "https://foreign.example"))).status).toBe(403);
    expect((await POST(pairRequest("incorrect"))).status).toBe(401);
  });
  it("issues an HttpOnly, strict cookie and uses Secure on HTTPS", async () => {
    const { POST } = await import("@/app/api/device/pair/route");
    const response = await POST(pairRequest(code));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain("Secure");
    vi.stubEnv("APP_ORIGIN", "https://family.example");
    const secure = await POST(pairRequest(code, "https://family.example"));
    expect(secure.headers.get("set-cookie")).toContain("Secure");
  });
  it("rejects oversized bodies and limits repeated attempts", async () => {
    const { POST } = await import("@/app/api/device/pair/route");
    expect((await POST(pairRequest("x".repeat(2000)))).status).toBe(400);
    for (let attempt = 0; attempt < 9; attempt++) expect((await POST(pairRequest("incorrect"))).status).toBe(401);
    const limited = await POST(pairRequest(code));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });
});

describe("task mutation boundary", () => {
  it("blocks unpaired devices before accessing any data", async () => {
    const { POST } = await import("@/app/api/tasks/[taskId]/complete/route");
    const request = new Request(`${origin}/api/tasks/test/complete`, { method: "POST", headers: { Origin: origin } });
    expect((await POST(request, { params: Promise.resolve({ taskId: familyId }) })).status).toBe(401);
  });
  it("rejects a foreign origin even with a valid session", async () => {
    const { signSession } = await import("@/server/auth/token");
    cookieState.token = signSession(familyId, secret);
    const { POST } = await import("@/app/api/tasks/[taskId]/complete/route");
    const request = new Request(`${origin}/api/tasks/test/complete`, { method: "POST", headers: { Origin: "https://foreign.example" } });
    expect((await POST(request, { params: Promise.resolve({ taskId: familyId }) })).status).toBe(403);
  });
  it("rejects writes when running the demo", async () => {
    vi.stubEnv("APP_MODE", "demo");
    const { POST } = await import("@/app/api/tasks/[taskId]/complete/route");
    expect((await POST(new Request(`${origin}/api/tasks/test/complete`, { method: "POST" }), { params: Promise.resolve({ taskId: familyId }) })).status).toBe(409);
  });
});
