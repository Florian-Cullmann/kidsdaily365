import { describe, expect, it } from "vitest";
import { managementSchemas, packageNameSchema, pairingSchema, registerSchema } from "@/domain/management";

describe("management validation", () => {
  it("rejects account privilege fields and short passwords", () => {
    const input = { name: "Parent", email: "parent@example.test", password: "a sufficiently long password", code: "one-time-code" };
    expect(registerSchema.safeParse({ ...input, familyId: "attacker-supplied" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, password: "short" }).success).toBe(false);
  });
  it("requires a child on Android devices and disallows one on wall devices", () => {
    expect(pairingSchema.safeParse({ kind: "android", label: "Phone" }).success).toBe(false);
    expect(pairingSchema.safeParse({ kind: "wall", label: "Hall", childId: "11111111-1111-4111-8111-111111111111" }).success).toBe(false);
  });
  it("accepts exact packages and rejects system settings, wildcards, URLs and commands", () => {
    expect(packageNameSchema.safeParse("com.audible.application").success).toBe(true);
    for (const value of ["com.android.settings", "com.android.systemui", "de.kidsdaily365.launcher", "com.example.*", "https://example.test", "com.app;reboot"]) expect(packageNameSchema.safeParse(value).success).toBe(false);
  });
  it("rejects impossible appointment ranges", () => {
    expect(managementSchemas.appointments.safeParse({ childId: "11111111-1111-4111-8111-111111111111", title: "Appointment", icon: "calendar", startsAt: "2026-11-01T16:00:00Z", endsAt: "2026-11-01T15:00:00Z" }).success).toBe(false);
  });
});

describe("appointment details", () => {
  const input = { childId: "11111111-1111-4111-8111-111111111111", title: "Sport", icon: "ball", startsAt: "2026-11-01T16:00:00Z" };
  it("accepts legacy requests, trims details and supports clearing", () => {
    expect(managementSchemas.appointments.parse(input)).toMatchObject({ location: "", preparation: "" });
    expect(managementSchemas.appointments.parse({ ...input, location: " Sporthalle ", preparation: "  " })).toMatchObject({ location: "Sporthalle", preparation: "" });
  });
  it("enforces both server-side length limits", () => {
    expect(managementSchemas.appointments.safeParse({ ...input, location: "x".repeat(160), preparation: "x".repeat(300) }).success).toBe(true);
    for (const extra of [{ location: "x".repeat(161) }, { preparation: "x".repeat(301) }, { location: null }]) {
      expect(managementSchemas.appointments.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
});
