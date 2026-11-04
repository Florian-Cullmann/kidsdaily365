import { expect, it } from "vitest";
import { firstRoutineDate } from "@/domain/management";

it("finds the first matching family-local day, including today and year rollover", () => {
  expect(firstRoutineDate("2026-11-04", [3])).toBe("2026-11-04");
  expect(firstRoutineDate("2026-11-04", [1])).toBe("2026-11-09");
  expect(firstRoutineDate("2026-12-31", [1])).toBe("2027-01-04");
  expect(firstRoutineDate("2026-11-04", [])).toBeNull();
});
