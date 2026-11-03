import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { launcherSnapshotSchema, launcherSnapshotV2Schema } from "../src/domain/launcher";

describe("shared Android contract fixture", () => {
  it("is accepted by the server schema and contains only read-only capabilities", () => {
    const fixture = JSON.parse(readFileSync(new URL("../contracts/launcher-v1.example.json", import.meta.url), "utf8"));
    expect(launcherSnapshotSchema.parse(fixture)).toEqual(fixture);
  });
});


it("v2 adds equipped IDs without introducing write capabilities", () => {
  const fixture = JSON.parse(readFileSync(new URL("../contracts/launcher-v2.example.json", import.meta.url), "utf8"));
  expect(launcherSnapshotV2Schema.parse(fixture)).toEqual(fixture);
  expect(launcherSnapshotSchema.safeParse(fixture).success).toBe(false);
  expect(launcherSnapshotV2Schema.safeParse({ ...fixture, capabilities: { ...fixture.capabilities, purchases: true } }).success).toBe(false);
});
