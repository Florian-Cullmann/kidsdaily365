import { describe, expect, it } from "vitest";
import { summarizeUsage, syncInput } from "@/domain/device-management";
const base = Date.parse("2026-10-24T21:50:00Z");
const event = (minute: number, kind: string, packageName = "app.test") => ({ at: new Date(base + minute * 60000).toISOString(), kind, packageName, label: "Test-App" });
describe("observed device usage", () => {
  it("separates interactive screen time from foreground app time and stops on screen-off", () => {
    const result = summarizeUsage([event(0, "screen-on"), event(2, "resume"), event(8, "pause"), event(10, "screen-off")], base, base + 60 * 60000, "Europe/Berlin");
    expect(result.screenMs).toBe(10 * 60000); expect(result.apps[0].milliseconds).toBe(6 * 60000);
  });
  it("splits family-local midnight and ignores duplicate screen-on events", () => {
    const result = summarizeUsage([event(0, "screen-on"), event(1, "screen-on"), event(20, "screen-off")], base, base + 30 * 60000, "Europe/Berlin");
    expect(result.days).toEqual({ "2026-10-24": 10 * 60000, "2026-10-25": 10 * 60000 });
  });
  it("closes active intervals on permission gaps or reboot without inventing initial screen usage", () => {
    const result = summarizeUsage([event(0, "resume"), event(5, "shutdown"), event(50, "screen-off")], base, base + 60 * 60000, "Europe/Berlin");
    expect(result.screenMs).toBe(0); expect(result.apps[0].milliseconds).toBe(5 * 60000);
  });
  it("clips ongoing sessions to the acknowledged sync horizon and requested period", () => {
    const result = summarizeUsage([event(0, "screen-on"), event(1, "resume")], base + 2 * 60000, base + 3 * 60000, "UTC");
    expect(result.screenMs).toBe(60000); expect(result.sessions[0].milliseconds).toBe(60000);
  });
  it("rejects additional capabilities, invalid revisions and unbounded event batches", () => {
    const input = { revision: 1, appliedLocked: false, ready: true, usagePermission: false, usageSince: null, usageThrough: null, error: null, events: [] };
    expect(syncInput.safeParse({ ...input, administration: true }).success).toBe(false);
    expect(syncInput.safeParse({ ...input, revision: -2 }).success).toBe(false);
    expect(syncInput.safeParse({ ...input, events: Array(41).fill({ ...event(0, "resume"), key: "x" }) }).success).toBe(false);
  });
});
