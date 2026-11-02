import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { launcherSnapshotSchema } from "../src/domain/launcher";

describe("shared Android contract fixture", () => {
  it("is accepted by the server schema and contains only read-only capabilities", () => {
    const fixture = JSON.parse(readFileSync(new URL("../contracts/launcher-v1.example.json", import.meta.url), "utf8"));
    expect(launcherSnapshotSchema.parse(fixture)).toEqual(fixture);
  });
});
