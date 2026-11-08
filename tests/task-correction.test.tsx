// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaskCorrection } from "@/components/task-correction";
import { demoPlans } from "@/domain/demo";
import { completeDemoTask, taskProgress } from "@/domain/plan";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("only withdraws after OK and permits safe retry after a lost response", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("Verbindung unterbrochen")).mockResolvedValueOnce(Response.json({ id: "stored" }));
  vi.stubGlobal("fetch", fetch);
  render(<TaskCorrection completionId="entry" />);
  const button = screen.getByRole("button", { name: "Bestätigung zurückziehen" });
  fireEvent.click(button);
  expect(screen.getByRole("dialog", { name: "Bestätigung wirklich zurückziehen?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(button);
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Verbindung unterbrochen"));
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ reason: "Bestätigung durch Eltern zurückgezogen.", confirmed: true });
});
it("shows server errors and prevents another request while saving", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(<TaskCorrection completionId="entry" />);
  fireEvent.click(screen.getByRole("button", { name: "Bestätigung zurückziehen" }));
  const ok = screen.getByRole("button", { name: "OK" });
  fireEvent.click(ok);
  expect((ok as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(ok);
  const cancelEvent = new Event("cancel", { cancelable: true });
  fireEvent(screen.getByRole("dialog"), cancelEvent);
  expect(cancelEvent.defaultPrevented).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  finish(Response.json({ error: "Nicht genügend Sterne." }, { status: 409 }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Nicht genügend Sterne."));
  expect(refresh).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "OK" }) as HTMLButtonElement).disabled).toBe(false);
});
it("never counts or completes a corrected task as ordinary work", () => {
  const plan = demoPlans()[0];
  plan.tasks = [{ ...plan.tasks[0], completed: false, corrected: true }];
  expect(taskProgress(plan.tasks)).toMatchObject({ done: 0, total: 0 });
  expect(taskProgress(plan.tasks).label).toContain("1 korrigiert");
  expect(completeDemoTask(plan, plan.tasks[0].id)).toBe(plan);
});
