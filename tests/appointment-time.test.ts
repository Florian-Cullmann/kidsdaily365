import { describe, expect, it } from "vitest";
import { appointmentCandidates as candidates, appointmentInstant as instant, appointmentLocalInput as local, appointmentRange as range } from "../src/domain/appointment-time";

const zone = "Europe/Berlin";
describe("appointment times in the family zone", () => {
  it("creates and edits independently of the host zone", () => {
    expect(candidates("2026-07-10T14:30", zone)).toEqual(["2026-07-10T12:30:00.000Z"]);
    expect(local("2026-07-10T12:30:00Z", zone)).toBe("2026-07-10T14:30");
  });
  it("rejects nonexistent and invalid dates", () => {
    for (const value of ["2026-03-29T02:30", "2026-02-30T12:00", "invalid"]) {
      expect(candidates(value, zone)).toEqual([]);
      expect(() => instant(value, zone, "")).toThrow("existiert");
    }
  });
  it("offers both autumn occurrences and requires a valid selection", () => {
    expect(candidates("2026-10-25T02:30", zone)).toEqual(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]);
    expect(() => instant("2026-10-25T02:30", zone, "")).toThrow("beiden");
  });
  it("preserves either occurrence and sub-minute precision when unchanged", () => {
    for (const original of ["2026-10-25T00:30:12.123Z", "2026-10-25T01:30:59.999Z", "2026-07-10T12:30:45.678Z"]) {
      const input = local(original, zone);
      const selected = candidates(input, zone).find((item) => item.slice(0, 16) === original.slice(0, 16))!;
      expect(instant(input, zone, selected, original)).toBe(original);
    }
    expect(instant("2026-10-25T02:30", zone, "2026-10-25T00:30:00.000Z", "2026-10-25T01:30:59.999Z")).toBe("2026-10-25T00:30:00.000Z");
  });
  it("compares actual instants across midnight and repeated hours", () => {
    expect(range("2026-07-10T21:30:00Z", "2026-07-10T22:30:00Z").endsAt).toBeTruthy();
    expect(range("2026-10-25T00:45:00Z", "2026-10-25T01:15:00Z").endsAt).toBeTruthy();
    expect(() => range("2026-10-25T01:15:00Z", "2026-10-25T00:45:00Z")).toThrow("nach");
    expect(() => range("2026-07-10T12:00:00Z", "2026-07-10T12:00:00Z")).toThrow("nach");
    expect(range("2026-07-10T12:00:00Z", null).endsAt).toBeNull();
  });
  it("handles non-hour offsets and half-hour transitions", () => {
    expect(candidates("2026-07-10T14:30", "Asia/Kathmandu")).toEqual(["2026-07-10T08:45:00.000Z"]);
    expect(candidates("2026-04-05T01:45", "Australia/Lord_Howe")).toHaveLength(2);
    expect(candidates("2026-10-04T02:15", "Australia/Lord_Howe")).toEqual([]);
  });
});
