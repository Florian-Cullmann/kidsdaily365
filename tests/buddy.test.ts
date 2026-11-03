import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buddyLayers } from "@/domain/buddy";

it("keeps the bare buddy and ignores unknown or duplicate accessories", () => {
  expect(buddyLayers("fox")).toEqual([]);
  expect(buddyLayers("rabbit", ["missing", "__proto__"])).toEqual([]);
  expect(buddyLayers("bear", ["star-badge", "star-badge", "future"])).toHaveLength(1);
});
it("uses identical base art on web and Android so shared anchors line up", () => {
  for (const kind of ["fox", "rabbit", "bear"] as const) {
    const web = readFileSync(`public/illustrations/buddy-${kind}.webp`);
    const android = readFileSync(`apps/android/app/src/main/res/drawable-nodpi/buddy_${kind}.webp`);
    expect(web.equals(android)).toBe(true);
  }
});
