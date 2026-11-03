import { describe, expect, it } from "vitest";
import { setupStatus, type SetupData } from "@/domain/setup";
const now = Date.parse("2026-11-04T12:00:00Z");
function household(): SetupData {
  return { children: [{ id: "mika", active: true }], routines: [{ childId: "mika", active: true, steps: [{ title: "Zähne putzen" }] }], devices: [{ kind: "wall", revokedAt: null, expiresAt: "2026-11-05T12:00:00Z" }] };
}
describe("household setup", () => {
  it("starts empty and resumes partial or complete persisted setup", () => {
    expect(setupStatus({ children: [], routines: [], devices: [] }, now)).toEqual({ child: false, routine: false, wall: false, complete: false });
    const data = household(); data.devices = [];
    expect(setupStatus(data, now)).toEqual({ child: true, routine: true, wall: false, complete: false });
    expect(setupStatus(JSON.parse(JSON.stringify(household())), now).complete).toBe(true);
  });
  it("reopens child and routine steps after archiving the child", () => {
    const data = household(); data.children[0].active = false;
    expect(setupStatus(data, now)).toEqual({ child: false, routine: false, wall: true, complete: false });
  });
  it("requires steps and an active routine belonging to an active child", () => {
    const data = household(); data.routines[0].active = false;
    expect(setupStatus(data, now).routine).toBe(false);
    data.routines[0].active = true; data.routines[0].childId = "other";
    expect(setupStatus(data, now).routine).toBe(false);
    data.routines[0].childId = "mika"; data.routines[0].steps = [];
    expect(setupStatus(data, now).routine).toBe(false);
  });
  it.each(["android", "revoked", "expired", "boundary", "invalid"])("rejects %s devices", (state) => {
    const data = household(); const device = data.devices[0];
    if (state === "android") device.kind = "android";
    if (state === "revoked") device.revokedAt = "2026-11-03T12:00:00Z";
    if (state === "expired") device.expiresAt = "2026-11-03T12:00:00Z";
    if (state === "boundary") device.expiresAt = new Date(now).toISOString();
    if (state === "invalid") device.expiresAt = "invalid";
    expect(setupStatus(data, now).wall).toBe(false);
    expect(setupStatus(data, now).complete).toBe(false);
  });
  it("allows any valid wall device and notices its later expiry", () => {
    const data = household(); data.devices.unshift({ kind: "wall", revokedAt: "2026-11-01", expiresAt: "2026-11-06" });
    expect(setupStatus(data, now).complete).toBe(true);
    expect(setupStatus(data, Date.parse("2026-11-06")).complete).toBe(false);
  });
});
