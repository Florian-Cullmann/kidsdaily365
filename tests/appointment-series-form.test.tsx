// @vitest-environment jsdom
import { createRef } from "react";
import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ParentRecordForm, type RecordDraft } from "@/components/parent-record-form";
import type { ManagementData } from "@/server/management";
import { createSeriesSchema } from "@/domain/appointment-series";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("submits a weekly series on LAN HTTP and keeps its idempotency key after a lost response", async () => {
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => webcrypto.getRandomValues(bytes) });
  const save = vi.fn().mockRejectedValueOnce(new Error("Bestätigung fehlt")).mockResolvedValueOnce(undefined);
  const data = { today: "2026-11-09", family: { timezone: "Europe/Berlin" }, children: [{ id: "81000000-0000-4000-a000-000000000001", name: "Mika", active: true }] } as ManagementData;
  render(<ParentRecordForm resource="appointments" data={data} record={null} busy={false} draftRef={createRef<RecordDraft>()} onSave={vi.fn()} onSaveSeries={save} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Was steht an?"), { target: { value: "Fiktiver Bastelnachmittag" } });
  fireEvent.click(screen.getByLabelText("Jede Woche"));
  fireEvent.change(screen.getByLabelText("Erster Termin · Beginn"), { target: { value: "2026-11-10T16:00" } });
  fireEvent.change(screen.getByLabelText("Wiederholen bis einschließlich"), { target: { value: "2026-11-24" } });
  expect(screen.getByRole("list", { name: "Alle Termine der Serie" }).children).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Terminserie anlegen" }));
  await waitFor(() => expect(screen.getByText("Bestätigung fehlt")).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(1);
  expect(createSeriesSchema.safeParse(save.mock.calls[0][0]).success).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Terminserie anlegen" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
});
