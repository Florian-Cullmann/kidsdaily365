import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/devices", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/devices")>();
  return { ...original, exchangePairingCode: state.exchange };
});
const origin = "http://localhost:3000";
const code = "test-only-one-time-device-code";
const pairRequest = (value: string, requestOrigin = origin) => new Request(`${origin}/api/device/pair`, {
  method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ code: value }),
});

beforeEach(() => {
  state.exchange.mockReset();
  state.exchange.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", kind: "wall", token: "wall-test-token" });
  vi.stubEnv("APP_MODE", "live"); vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("FAMILY_ID", "11111111-1111-4111-8111-111111111111");
  vi.stubEnv("DATABASE_URL", "postgres://localhost/unused_test");
  vi.stubEnv("SETUP_CODE", "test-only-long-first-setup-code");
  vi.stubEnv("SESSION_SECRET", "test-only-long-session-signing-secret");
});

describe("HTTP boundary with a stubbed pairing service", () => {
  it("rejects a foreign origin before consuming a pairing code", async () => {
    const { POST } = await import("@/app/api/device/pair/route");
    expect((await POST(pairRequest(code, "https://foreign.example"))).status).toBe(403);
    expect(state.exchange).not.toHaveBeenCalled();
  });
  it("keeps wall tokens out of JSON and issues strict HttpOnly cookies", async () => {
    const { POST } = await import("@/app/api/device/pair/route");
    const response = await POST(pairRequest(code));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, kind: "wall" });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
    vi.stubEnv("APP_ORIGIN", "https://family.example");
    const secure = await POST(pairRequest(code, "https://family.example"));
    expect(secure.headers.get("set-cookie")).toContain("Secure");
  });
  it("does not issue a browser cookie for an Android device", async () => {
    state.exchange.mockResolvedValue({ id: "android-id", kind: "android", token: "android-test-token" });
    const { POST } = await import("@/app/api/device/pair/route");
    const response = await POST(pairRequest(code));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await response.json()).token).toBe("android-test-token");
  });
  it("bounds request bodies and repeated pairing attempts", async () => {
    const { POST } = await import("@/app/api/device/pair/route");
    expect((await POST(pairRequest("x".repeat(20_000)))).status).toBe(400);
    for (let attempt = 0; attempt < 9; attempt++) await POST(pairRequest(code));
    expect((await POST(pairRequest(code))).status).toBe(429);
  });
});

describe("task mutation boundary", () => {
  it("blocks unpaired devices and native bearer tokens without DB access", async () => {
    const { POST } = await import("@/app/api/tasks/[taskId]/complete/route");
    const context = { params: Promise.resolve({ taskId: "11111111-1111-4111-8111-111111111111" }) };
    expect((await POST(new Request(`${origin}/api/tasks/test/complete`, { method: "POST", headers: { Origin: origin } }), context)).status).toBe(401);
    expect((await POST(new Request(`${origin}/api/tasks/test/complete`, { method: "POST", headers: { Origin: origin, Authorization: "Bearer android-token" } }), context)).status).toBe(403);
  });
  it("rejects writes when running the demo", async () => {
    vi.stubEnv("APP_MODE", "demo");
    const { POST } = await import("@/app/api/tasks/[taskId]/complete/route");
    expect((await POST(new Request(`${origin}/api/tasks/test/complete`, { method: "POST" }), { params: Promise.resolve({ taskId: "test" }) })).status).toBe(409);
  });
  it("requires a matching origin for parent registration", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    expect((await POST(new Request(`${origin}/api/auth/register`, { method: "POST", headers: { Origin: "https://foreign.example" } }))).status).toBe(403);
  });
});
