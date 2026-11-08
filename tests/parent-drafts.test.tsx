// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ParentConsole } from "@/components/parent-console";
import type { ManagementData } from "@/server/management";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, onNavigate, ...props }: { children: React.ReactNode; onNavigate?: (event: { preventDefault: () => void }) => void }) => <a {...props} onClick={onNavigate}>{children}</a> }));
const parent = { id: "parent", familyId: "family", name: "Demo-Eltern", email: "demo@example.test" };
const data = {
  childFilter: { id: "", invalid: false }, limited: { tasks: false, appointments: false },
  family: { name: "Testfamilie", timezone: "Europe/Berlin" }, today: "2026-11-04",
  children: [{ id: "child", name: "Mika", avatar: "M", active: true, buddyInitialized: false, equippedAccessories: [], ownedAccessories: [] }],
  routines: ["Morgen", "Abend"].map((title, index) => ({ id: `routine-${index}`, title, childId: "child", active: true, weekdays: [1, 2, 3, 4, 5], section: "morning", sortOrder: 0, steps: [{ title: "Zähne putzen", description: "", icon: "toothbrush", points: 5 }, { title: "Rucksack packen", description: "", icon: "backpack", points: 3 }] })),
  rewardRequests: [], wallets: [], pauses: [], tasks: [], appointments: [], rewards: [], apps: [], devices: [], parents: [],
} as unknown as ManagementData;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector<HTMLButtonElement>("button")?.focus(); };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function mount() { return render(<ParentConsole parent={parent} initialData={data} initialTab="routines" />); }
function edit() { fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]); }
function changeTitle() { fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Neuer Morgen" } }); }
function unload() { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }
function navigate() { fireEvent.click(screen.getByRole("button", { name: "Termine" })); }
function discard() { fireEvent.click(screen.getByRole("button", { name: "Änderungen verwerfen" })); }

describe("Elternentwürfe", () => {
  it("protects a weekly series draft when changing the child filter", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    mount(); navigate(); fireEvent.click(screen.getByRole("button", { name: "Neu anlegen" }));
    fireEvent.click(screen.getByLabelText("Jede Woche"));
    fireEvent.change(screen.getByLabelText("Erster Termin · Beginn"), { target: { value: "2027-03-23T16:00" } });
    fireEvent.change(screen.getByLabelText("Wiederholen bis einschließlich"), { target: { value: "2027-04-13" } });
    expect(unload()).toBe(true);
    fireEvent.change(screen.getByLabelText("Kind auswählen"), { target: { value: "child" } });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    expect((screen.getByLabelText("Erster Termin · Beginn") as HTMLInputElement).value).toBe("2027-03-23T16:00");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("protects a draft when changing or clearing the child filter", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ...data, childFilter: { id: "child", invalid: false } }));
    vi.stubGlobal("fetch", fetch);
    mount(); edit(); changeTitle();
    fireEvent.change(screen.getByLabelText("Kind auswählen"), { target: { value: "child" } });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    expect((screen.getByLabelText("Bezeichnung") as HTMLInputElement).value).toBe("Neuer Morgen");
    expect((screen.getByLabelText("Kind auswählen") as HTMLSelectElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Kind auswählen"), { target: { value: "child" } });
    discard();
    await waitFor(() => expect(screen.queryByLabelText("Bezeichnung")).toBeNull());
    expect(fetch).toHaveBeenCalledWith("/api/parent/data?child=child", expect.anything());
    edit(); changeTitle();
    fireEvent.click(screen.getByRole("button", { name: "Alle Kinder anzeigen" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(Response.json(data));
    discard();
    await waitFor(() => expect((screen.getByLabelText("Kind auswählen") as HTMLSelectElement).value).toBe(""));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["Kinderprofile", "Routinen", "Einzelaufgaben", "Termine", "Wünsche", "Android-Apps"])("compares actual values and reversions in %s", (tab) => {
    mount(); fireEvent.click(screen.getByRole("button", { name: tab }));
    fireEvent.click(screen.getByRole("button", { name: tab === "Kinderprofile" ? "Kind hinzufügen" : "Neu anlegen" }));
    expect(unload()).toBe(false);
    const input = screen.getByLabelText(tab === "Kinderprofile" ? "Name" : tab === "Android-Apps" ? "Anzeigename" : tab === "Wünsche" ? "Wunsch oder Belohnung" : tab === "Termine" ? "Was steht an?" : "Bezeichnung");
    fireEvent.change(input, { target: { value: "Entwurf" } }); expect(unload()).toBe(true);
    fireEvent.change(input, { target: { value: "" } }); expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" })); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("continues with all values and input focus, then discards without writing", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); mount(); edit(); changeTitle();
    const input = screen.getByLabelText("Bezeichnung"); input.focus(); navigate();
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe("unsaved-description");
    fireEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    expect(document.activeElement).toBe(input); expect((input as HTMLInputElement).value).toBe("Neuer Morgen");
    navigate(); discard(); expect(screen.queryByLabelText("Bezeichnung")).toBeNull(); expect(unload()).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it("protects cancel, new records, other records and the home link", () => {
    mount(); edit(); changeTitle();
    for (const click of [() => fireEvent.click(screen.getAllByRole("button", { name: "Routine kopieren" })[0]), () => fireEvent.click(screen.getAllByRole("button", { name: "Pausen verwalten" })[0]), () => fireEvent.click(screen.getByRole("button", { name: "Abbrechen" })), () => fireEvent.click(screen.getByRole("button", { name: "Neu anlegen" })), () => fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[1]), () => fireEvent.click(screen.getByText("Zum Kinderbildschirm"))]) {
      click(); expect(screen.getByRole("dialog")).toBeTruthy(); fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      expect((screen.getByLabelText("Bezeichnung") as HTMLInputElement).value).toBe("Neuer Morgen");
    }
    fireEvent.click(screen.getByRole("button", { name: "Neu anlegen" })); discard();
    expect((screen.getByLabelText("Bezeichnung") as HTMLInputElement).value).toBe(""); expect(unload()).toBe(false);
  });
  it("protects copy drafts and clears them after a confirmed copy even if refresh fails", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({})).mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    mount(); edit(); changeTitle();
    fireEvent.click(screen.getAllByRole("button", { name: "Routine kopieren" })[0]); discard();
    expect((screen.getByLabelText("Bezeichnung") as HTMLInputElement).value).toBe("Morgen");
    expect(unload()).toBe(false);
    changeTitle(); navigate();
    fireEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    expect(unload()).toBe(true);
    fireEvent.submit(screen.getByLabelText("Bezeichnung").closest("form")!);
    await waitFor(() => expect(screen.queryByLabelText("Bezeichnung")).toBeNull());
    expect(fetch.mock.calls[0][0]).toBe("/api/parent/routines/routine-0/copy");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(unload()).toBe(false);
  });
  it("tracks step edits, order and add/remove, including complete restoration", () => {
    mount(); edit();
    fireEvent.click(screen.getByText(/1\. .*Zähne putzen/)); expect(unload()).toBe(false);
    const step = screen.getAllByLabelText("Aufgabe")[0];
    fireEvent.change(step, { target: { value: "Waschen" } }); expect(unload()).toBe(true);
    fireEvent.change(step, { target: { value: "Zähne putzen" } }); expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Schritt 1 nach unten" })); expect(unload()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Schritt 2 nach oben" })); expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Aufgabe hinzufügen" })); expect(unload()).toBe(true);
    const details = screen.getAllByLabelText("Aufgabe")[2].closest("details")!;
    fireEvent.click(within(details).getByRole("button", { name: "Entfernen" })); expect(unload()).toBe(false);
  });
  it.each(["validation", "network"])("keeps draft on %s failure and blocks navigation during save", async (failure) => {
    let reject!: (error: Error) => void; let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((yes, no) => { resolve = yes; reject = no; })));
    mount(); edit(); changeTitle(); fireEvent.submit(screen.getByLabelText("Bezeichnung").closest("form")!);
    expect((screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Zum Kinderbildschirm")); expect(router.push).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
    if (failure === "network") reject(new TypeError("offline")); else resolve(Response.json({ error: "Bitte prüfen" }, { status: 400 }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).not.toBe(""));
    expect((screen.getByLabelText("Bezeichnung") as HTMLInputElement).value).toBe("Neuer Morgen"); expect(unload()).toBe(true);
  });
  it("saves once, closes the draft and navigates without another warning", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(data));
    vi.stubGlobal("fetch", fetch); mount(); edit(); changeTitle();
    const form = screen.getByLabelText("Bezeichnung").closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(screen.queryByLabelText("Bezeichnung")).toBeNull());
    expect(fetch.mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(1);
    expect(unload()).toBe(false); navigate(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("clears a confirmed save even if the following refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({})).mockRejectedValueOnce(new TypeError("offline")));
    mount(); edit(); changeTitle(); fireEvent.submit(screen.getByLabelText("Bezeichnung").closest("form")!);
    await waitFor(() => expect(screen.queryByLabelText("Bezeichnung")).toBeNull()); expect(unload()).toBe(false);
  });
  it.each(["logout", "expired"])("lets %s clear private drafts without confirmation", async (reason) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: reason === "expired" ? 401 : 200 })));
    mount(); edit(); changeTitle();
    if (reason === "logout") fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    else fireEvent.submit(screen.getByLabelText("Bezeichnung").closest("form")!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByLabelText("Bezeichnung")).toBeNull(); expect(screen.queryByRole("dialog")).toBeNull(); expect(unload()).toBe(false);
  });
});


describe("Einrichtung mit Kinderfilter", () => {
  it("evaluates the household without discarding the selected child filter", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetch);
    const filtered = { ...data, childFilter: { id: "child", invalid: false }, routines: [] };
    render(<ParentConsole parent={parent} initialData={filtered} />);
    expect(screen.getByText("Einrichtungsstatus wird geladen …")).toBeTruthy();
    expect(await screen.findByText("Eine aktive Routine mit Schritten gehört zu einem aktiven Kind.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/parent/data", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Routinen verwalten" }));
    expect((screen.getByLabelText("Kind auswählen") as HTMLSelectElement).value).toBe("child");
  });
});
