import { describe, expect, it } from "vitest";
import { appointmentLabel, relevantAppointments } from "@/domain/appointments";
import type { Appointment } from "@/domain/plan";

const appointment = (startsAt: string, endsAt: string | null = null): Appointment => ({ id: startsAt, title: "Musik", startsAt, endsAt, icon: "calendar" });
const zone = "Europe/Berlin";

describe("appointment visibility and labels", () => {
  it("includes the start but excludes the end, including across midnight", () => {
    const item = appointment("2026-11-01T22:30:00Z", "2026-11-02T00:30:00Z");
    for (const at of [item.startsAt, "2026-11-01T23:30:00Z"]) {
      expect(relevantAppointments([item], zone, new Date(at))).toEqual([item]);
      expect(appointmentLabel(item, zone, new Date(at))).toBe("Jetzt");
    }
    expect(relevantAppointments([item], zone, new Date(item.endsAt!))).toEqual([]);
    expect(appointmentLabel(item, zone, new Date(item.endsAt!))).not.toBe("Jetzt");
  });

  it.each([
    ["2026-03-29T00:30:00Z", "2026-03-29T21:59:59Z", "2026-03-29T22:00:00Z"],
    ["2026-10-25T00:30:00Z", "2026-10-25T22:59:59Z", "2026-10-25T23:00:00Z"],
  ])("keeps an end-less appointment through its family day across DST: %s", (start, before, midnight) => {
    const item = appointment(start);
    expect(relevantAppointments([item], zone, new Date(before))).toEqual([item]);
    expect(appointmentLabel(item, zone, new Date(before))).toBe("Heute");
    expect(relevantAppointments([item], zone, new Date(midnight))).toEqual([]);
  });

  it("uses the family's day instead of UTC or the browser's zone", () => {
    const item = appointment("2026-11-01T10:00:00Z");
    const now = new Date("2026-11-01T23:30:00Z");
    expect(relevantAppointments([item], zone, now)).toEqual([]);
    expect(relevantAppointments([item], "America/New_York", now)).toEqual([item]);
    expect(appointmentLabel(item, "America/New_York", now)).toBe("Heute");
  });

  it("keeps every future appointment in chronological order and advances the preview", () => {
    const items = Array.from({ length: 6 }, (_, index) => appointment(`2026-11-0${index + 1}T10:00:00Z`, `2026-11-0${index + 1}T11:00:00Z`));
    expect(relevantAppointments([...items].reverse(), zone, new Date("2026-11-01T09:00:00Z"))).toEqual(items);
    const next = relevantAppointments(items, zone, new Date("2026-11-01T11:00:00Z"))[0];
    expect(next).toEqual(items[1]);
    expect(appointmentLabel(next, zone, new Date("2026-11-01T11:00:00Z"))).not.toMatch(/Jetzt|Heute/);
  });
});
