import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ parent: vi.fn(), preview: vi.fn() }));
vi.mock("@/server/config", () => ({ appMode: () => "live" }));
vi.mock("@/server/auth/parent", () => ({ currentParent: mocks.parent }));
vi.mock("@/server/week-preview", () => ({ getWeekPreview: mocks.preview }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));
import PrintDayPage from "@/app/eltern/druck/page";
import { ApiError } from "@/server/errors";

beforeEach(() => vi.resetAllMocks());
it("requires a parent before reading any planning data", async () => {
  mocks.parent.mockResolvedValue(null);
  await expect(PrintDayPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
  expect(mocks.preview).not.toHaveBeenCalled();
});
it("uses the authenticated parent's scope and rejects a child outside that scope", async () => {
  const parent = { id: "parent", familyId: "own-household" };
  mocks.parent.mockResolvedValue(parent);
  mocks.preview.mockRejectedValue(new ApiError("Kinderprofil nicht gefunden.", 404));
  const input = { childId: "foreign-child", date: "2026-11-04" };
  await expect(PrintDayPage({ searchParams: Promise.resolve(input) })).rejects.toThrow("not-found");
  expect(mocks.preview).toHaveBeenCalledWith(parent, input);
});
