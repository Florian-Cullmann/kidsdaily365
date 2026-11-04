import { describe, expect, it } from "vitest";
import { appointmentStatus } from "@/domain/appointments";
import type { Appointment } from "@/domain/plan";

const item: Appointment = { id: "test", title: "Sport", icon: "ball", startsAt: "2026-10-24T22:30:00Z", endsAt: "2026-10-25T02:30:00Z" };
describe("appointment time boundaries", () => {
  it("keeps an overnight appointment through the DST change, with an exclusive end", () => {
    expect(appointmentStatus(item, new Date("2026-10-24T22:29:59Z"), "Europe/Berlin")).toBe("upcoming");
    expect(appointmentStatus(item, new Date(item.startsAt), "Europe/Berlin")).toBe("running");
    expect(appointmentStatus(item, new Date("2026-10-25T02:29:59Z"), "Europe/Berlin")).toBe("running");
    expect(appointmentStatus(item, new Date(item.endsAt!), "Europe/Berlin")).toBe("past");
  });
  it("keeps reminders without an end until family-local midnight, without calling them running", () => {
    const reminder = { ...item, endsAt: null };
    expect(appointmentStatus(reminder, new Date("2026-10-25T22:59:59Z"), "Europe/Berlin")).toBe("today");
    expect(appointmentStatus(reminder, new Date("2026-10-25T23:00:00Z"), "Europe/Berlin")).toBe("past");
    expect(appointmentStatus({ ...reminder, startsAt: "2026-11-01T00:00:00Z" }, new Date("2026-11-01T08:00:00Z"), "America/Los_Angeles")).toBe("past");
  });
});
