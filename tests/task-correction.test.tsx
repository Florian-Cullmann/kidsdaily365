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
it("requires an explicit reason and confirmation and permits safe retry after a lost response", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("Verbindung unterbrochen")).mockResolvedValueOnce(Response.json({ id: "stored" }));
  vi.stubGlobal("fetch", fetch);
  render(<TaskCorrection completionId="entry" title="Zähne putzen" childName="Mila" date="08.11.2026" completedAt="08.11.2026, 08:15" stars={5} />);
  fireEvent.click(screen.getByRole("button", { name: "Abschluss korrigieren" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(/Diese Aufgabe wird nicht wieder geöffnet/)).toBeTruthy();
  const confirm = screen.getByRole("button", { name: "Korrektur bestätigen" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Begründung"), { target: { value: "Versehentlich berührt" } });
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Verbindung unterbrochen"));
  expect(refresh).not.toHaveBeenCalled();
  expect((screen.getByRole("dialog") as HTMLDialogElement).open).toBe(true);
  fireEvent.click(confirm);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
});
it("never counts or completes a corrected task as ordinary work", () => {
  const plan = demoPlans()[0];
  plan.tasks = [{ ...plan.tasks[0], completed: false, corrected: true }];
  expect(taskProgress(plan.tasks)).toMatchObject({ done: 0, total: 0 });
  expect(taskProgress(plan.tasks).label).toContain("1 korrigiert");
  expect(completeDemoTask(plan, plan.tasks[0].id)).toBe(plan);
});
