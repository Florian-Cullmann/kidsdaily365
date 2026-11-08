// @vitest-environment jsdom
import { createRef } from "react";
import { ParentRecordForm, type RecordDraft } from "@/components/parent-record-form";
import type { ManagementData } from "@/server/management";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactivateChildDialog } from "@/components/reactivate-child-dialog";
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; });
afterEach(cleanup);
it("explains consequences before confirmation and allows cancellation", () => {
  const onConfirm = vi.fn(), onCancel = vi.fn();
  render(<ReactivateChildDialog name="Mika" busy={false} error="" onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.getByRole("dialog", { name: "Mika wieder aktivieren?" }).textContent).toContain("Ausgelassene Tage werden nicht nachträglich angelegt");
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(onCancel).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Profil wieder aktivieren" }));
  expect(onConfirm).toHaveBeenCalledOnce();
});
it("prevents repeated confirmation and dismissal during a request and displays errors", () => {
  const onConfirm = vi.fn(), onCancel = vi.fn();
  render(<ReactivateChildDialog name="Mika" busy error="Bitte erneut versuchen." onConfirm={onConfirm} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Wird aktiviert …" }));
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(onConfirm).not.toHaveBeenCalled(); expect(onCancel).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe("Bitte erneut versuchen.");
});

it.each([true, false])("keeps child archive status %s when saving profile edits", async (active) => {
  const save = vi.fn();
  const record = { id: "68000000-0000-4000-a000-000000000001", name: "Mika", avatar: "M", active, reducedMotion: true };
  const data = { today: "2026-11-09", family: { timezone: "Europe/Berlin" }, children: [record] } as ManagementData;
  render(<ParentRecordForm resource="children" data={data} record={record} busy={false} draftRef={createRef<RecordDraft>()} onSave={save} onCancel={vi.fn()} />);
  expect(screen.queryByRole("checkbox", { name: "Aktiv" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ active }));
});
