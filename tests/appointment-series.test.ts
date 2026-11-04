import { describe, expect, it } from "vitest";
import { previewSeries, resolveSeries, type SeriesInput } from "@/domain/appointment-series";
import { appointmentLocalInput } from "@/domain/appointment-time";
const zone = "Europe/Berlin";
const base: SeriesInput = { location: "", preparation: "", requestId: "", childId: "", title: "Musik", icon: "calendar", startLocal: "2026-01-06T16:00", endLocal: "2026-01-06T17:00", until: "2027-01-06", choices: {} };
describe("weekly appointment expansion", () => {
  it("keeps family time across both DST transitions and includes at most 53 occurrences", () => {
    const result = resolveSeries(base, zone);
    expect(result).toHaveLength(53);
    expect(result.every((item) => appointmentLocalInput(item.startsAt, zone).endsWith("T16:00"))).toBe(true);
    expect(new Set(result.map((item) => item.startsAt.slice(11, 16)))).toEqual(new Set(["15:00", "14:00"]));
    expect(result.at(-1)!.startsAt).toBe("2027-01-05T15:00:00.000Z");
  });
  it("rejects invalid dates, reversed/overlong series and nonexistent local times", () => {
    for (const patch of [{ until: "2026-01-05" }, { until: "2027-01-07" }, { startLocal: "2026-02-30T16:00" }, { endLocal: "2026-01-06T15:00" }]) expect(() => resolveSeries({ ...base, ...patch }, zone)).toThrow();
    expect(() => previewSeries({ startLocal: "2026-03-22T02:30", endLocal: null, until: "2026-04-05" }, zone)).toThrow("2026-03-29T02:30");
    expect(() => previewSeries({ startLocal: "2026-03-22T01:30", endLocal: "2026-03-22T02:30", until: "2026-04-05" }, zone)).toThrow("2026-03-29T02:30");
  });
  it("requires explicit valid choices for ambiguous starts and ends", () => {
    const data = { ...base, startLocal: "2026-10-18T02:15", endLocal: "2026-10-18T02:45", until: "2026-11-01" };
    expect(() => resolveSeries(data, zone)).toThrow("ausdrücklich");
    const choices = { "start:2026-10-25T02:15": "2026-10-25T00:15:00.000Z", "end:2026-10-25T02:45": "2026-10-25T01:45:00.000Z" };
    expect(resolveSeries({ ...data, choices }, zone)[1]).toMatchObject({ startsAt: choices["start:2026-10-25T02:15"], endsAt: choices["end:2026-10-25T02:45"] });
    expect(() => resolveSeries({ ...data, choices: { ...choices, "start:2026-10-25T02:15": "2026-10-25T03:15:00.000Z" } }, zone)).toThrow();
    expect(() => resolveSeries({ ...data, choices: { "start:2026-10-25T02:15": "2026-10-25T01:15:00.000Z", "end:2026-10-25T02:45": "2026-10-25T00:45:00.000Z" } }, zone)).toThrow("Ende");
  });
  it("can end at the second occurrence of the same wall time after starting at the first", () => {
    const data = { ...base, startLocal: "2026-10-25T02:30", endLocal: "2026-10-25T02:30", until: "2026-10-25", choices: { "start:2026-10-25T02:30": "2026-10-25T00:30:00.000Z", "end:2026-10-25T02:30": "2026-10-25T01:30:00.000Z" } };
    expect(resolveSeries(data, zone)[0]).toEqual({ index: 0, startsAt: "2026-10-25T00:30:00.000Z", endsAt: "2026-10-25T01:30:00.000Z" });
  });
  it("supports overnight, no-end, inclusive single dates and leap-day limits", () => {
    const result = resolveSeries({ ...base, startLocal: "2026-03-28T23:00", endLocal: "2026-03-29T04:00", until: "2026-04-04" }, zone);
    expect(result.map((item) => (Date.parse(item.endsAt!) - Date.parse(item.startsAt)) / 3600000)).toEqual([4, 5]);
    expect(resolveSeries({ ...base, endLocal: null, until: "2026-01-06" }, zone)).toEqual([{ index: 0, startsAt: "2026-01-06T15:00:00.000Z", endsAt: null }]);
    expect(previewSeries({ startLocal: "2028-02-29T12:00", endLocal: null, until: "2029-02-28" }, zone)).toHaveLength(53);
    expect(() => previewSeries({ startLocal: "2028-02-29T12:00", endLocal: null, until: "2029-03-01" }, zone)).toThrow();
  });
});
