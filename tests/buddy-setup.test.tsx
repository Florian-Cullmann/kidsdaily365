// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "@/components/dashboard";
import { BuddySetup } from "@/components/buddy-setup";
import { demoPlans } from "@/domain/demo";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requires preview and confirmation, retains the choice after a lost response, and runs without secure-context crypto", async () => {
  vi.stubGlobal("crypto", undefined);
  const save = vi.fn().mockResolvedValueOnce({ error: "Die Bestätigung fehlt." }).mockResolvedValueOnce({ childId: "mila", awarded: 0 });
  render(<BuddySetup child={demoPlans()[0].child} busy={false} connected onSave={save} onBack={vi.fn()} onRetry={vi.fn()} />);
  expect((screen.getByRole("button", { name: "Meinen Buddy ansehen" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Hase" }));
  fireEvent.change(screen.getByLabelText("Wie soll dein Buddy heißen?"), { target: { value: " Flocke " } });
  fireEvent.click(screen.getByRole("button", { name: "Meinen Buddy ansehen" }));
  expect(screen.getByRole("heading", { name: "Flocke" })).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Noch mal überlegen" }));
  expect((screen.getByLabelText("Wie soll dein Buddy heißen?") as HTMLInputElement).value).toBe(" Flocke ");
  fireEvent.click(screen.getByRole("button", { name: "Meinen Buddy ansehen" }));
  fireEvent.click(screen.getByRole("button", { name: "Das ist mein Buddy" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Die Bestätigung fehlt."));
  fireEvent.click(screen.getByRole("button", { name: "Das ist mein Buddy" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls).toEqual([["rabbit", "Flocke"], ["rabbit", "Flocke"]]);
});

it("opens onboarding only for pending profiles and shows the persisted winner after confirmation and profile switches", async () => {
  const plans = demoPlans(); plans[0].child.buddyInitialized = false;
  const stored = { ...plans[0], child: { ...plans[0].child, buddyInitialized: true, buddyKind: "bear" as const, buddyName: "Bruno" } };
  let saved = false;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { saved = true; return Response.json({ plan: stored }); }
    return Response.json({ plans: saved ? [stored, ...plans.slice(1)] : plans, syncedAt: new Date().toISOString() });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Dashboard initialPlans={plans} demo={false} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`${plans[0].child.name}.*Wähle deinen Buddy`) }));
  fireEvent.click(screen.getByRole("button", { name: "Hase" }));
  fireEvent.change(screen.getByLabelText("Wie soll dein Buddy heißen?"), { target: { value: "Lumi" } });
  fireEvent.click(screen.getByRole("button", { name: "Meinen Buddy ansehen" }));
  fireEvent.click(screen.getByRole("button", { name: "Das ist mein Buddy" }));
  await waitFor(() => expect(screen.getByLabelText("Dein Buddy Bruno")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Wer ist dran?" }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`${plans[0].child.name}.*mit Bruno`) }));
  expect(screen.queryByLabelText("Wie soll dein Buddy heißen?")).toBeNull();
  expect(screen.getByLabelText("Dein Buddy Bruno")).toBeTruthy();
});
