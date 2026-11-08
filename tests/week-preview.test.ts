import { describe, expect, it, vi } from "vitest";
import { previewDate, shiftDate, weekStart } from "@/domain/week-preview";

vi.mock("@/server/auth/parent", () => ({ currentParent: async () => null }));
vi.mock("@/server/week-preview", () => ({ getWeekPreview: vi.fn() }));
vi.mock("@/server/config", () => ({ appMode: () => "live" }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: vi.fn() }));

describe("week selection", () => {
  it("uses Monday weeks across years and leap days", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2026-03-29", 1)).toBe("2026-03-30");
    expect(() => previewDate.parse("2026-02-29")).toThrow();
  });
  it("requires a parent session before reading any preview data", async () => {
    const { default: Page } = await import("@/app/eltern/woche/page");
    const { getWeekPreview } = await import("@/server/week-preview");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
    expect(getWeekPreview).not.toHaveBeenCalled();
  });
});
