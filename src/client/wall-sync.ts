import { localDate, type DayPlan } from "@/domain/plan";

export type WallState = {
  plans: DayPlan[];
  phase: "connected" | "offline" | "revoked";
  syncedAt: string | null;
  refreshing: boolean;
  dayChanged: boolean;
  busyTaskId: string | null;
};
export type Completion = { childId: string; awarded: number } | { error: string } | null;

const intervalMs = 10_000;
const timeoutMs = 5_000;

/** One request owner for polling and writes. Aborted/late responses never publish old state. */
export class WallSync {
  private state: WallState;
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private read: AbortController | null = null;
  private write: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;

  constructor(plans: DayPlan[], syncedAt: string | null, private fetcher: typeof fetch = (...args) => fetch(...args), private now = () => new Date()) {
    this.state = { plans, syncedAt, phase: "connected", refreshing: false, dayChanged: false, busyTaskId: null };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private publish(patch: Partial<WallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private checkDay() {
    const changed = this.state.plans.some((plan) => localDate(this.now(), plan.timezone) !== plan.date);
    if (changed !== this.state.dayChanged) this.publish({ dayChanged: changed });
    return changed;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.ticks = 0;
    void this.refresh();
    this.timer = setInterval(() => {
      const wasChanged = this.state.dayChanged;
      this.checkDay();
      this.ticks++;
      if (this.ticks % (intervalMs / 1000) === 0 || (!wasChanged && this.state.dayChanged)) void this.refresh();
    }, 1000);
  }

  stop() {
    this.active = false;
    this.generation++;
    this.read?.abort(); this.read = null;
    this.write?.abort(); this.write = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.state.busyTaskId || this.state.refreshing) this.publish({ busyTaskId: null, refreshing: false });
  }

  private revoked() {
    this.stop();
    this.publish({ plans: [], phase: "revoked", syncedAt: null, dayChanged: false, busyTaskId: null });
  }

  offline = () => {
    if (!this.active || this.state.phase === "revoked") return;
    this.read?.abort(); this.read = null;
    this.generation++;
    // Do not invalidate a write solely because the browser reports a network change.
    this.publish({ phase: "offline", refreshing: false });
    this.checkDay();
  };

  refresh = async () => {
    this.checkDay();
    if (!this.active || this.state.phase === "revoked" || this.read || this.write) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.read = controller;
    this.publish({ refreshing: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher("/api/wall/snapshot", { cache: "no-store", signal: controller.signal });
      if (!this.active || generation !== this.generation) return;
      if (response.status === 401 || response.status === 403) { this.revoked(); return; }
      if (!response.ok) throw new Error("snapshot unavailable");
      const data = await response.json() as { plans: DayPlan[]; syncedAt: string };
      if (!this.active || generation !== this.generation) return;
      if (controller.signal.aborted || !Array.isArray(data.plans) || !Number.isFinite(Date.parse(data.syncedAt))) throw new Error("invalid snapshot");
      this.publish({ plans: data.plans, syncedAt: data.syncedAt, phase: "connected" });
      this.checkDay();
    } catch {
      if (this.active && generation === this.generation) this.publish({ phase: "offline" });
    } finally {
      clearTimeout(timeout);
      if (this.read === controller) {
        this.read = null;
        this.publish({ refreshing: false });
      }
    }
  };

  async complete(taskId: string): Promise<Completion> {
    if (!this.active || this.write || this.state.phase !== "connected") return null;
    const plan = this.state.plans.find((item) => item.tasks.some((task) => task.id === taskId));
    if (!plan || localDate(this.now(), plan.timezone) !== plan.date) {
      void this.refresh();
      return { error: "Ein neuer Tag hat begonnen. Dein Tagesplan wird geladen." };
    }
    this.generation++;
    this.read?.abort(); this.read = null;
    const controller = new AbortController();
    this.write = controller;
    this.publish({ busyTaskId: taskId, refreshing: false });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(`/api/tasks/${taskId}/complete`, { method: "POST", signal: controller.signal });
      if (!this.active || this.write !== controller) return null;
      if (response.status === 401 || response.status === 403) { this.revoked(); return null; }
      const data = await response.json();
      if (!this.active || this.write !== controller) return null;
      if (controller.signal.aborted) throw new Error("completion timed out");
      if (!response.ok) return { error: typeof data.error === "string" ? data.error : "Das Speichern hat nicht geklappt. Bitte erneut versuchen." };
      if (data.childId !== plan.child.id || data.plan?.child?.id !== plan.child.id) throw new Error("invalid completion");
      this.publish({ plans: this.state.plans.map((item) => item.child.id === data.childId ? data.plan : item) });
      this.checkDay();
      return { childId: data.childId, awarded: data.awarded };
    } catch {
      if (!this.active || this.write !== controller) return null;
      this.publish({ phase: "offline" });
      return { error: "Die Bestätigung fehlt. Sobald die Verbindung wieder da ist, prüfen wir, ob deine Aufgabe gespeichert wurde." };
    } finally {
      clearTimeout(timeout);
      if (this.write === controller) {
        this.write = null;
        this.publish({ busyTaskId: null });
        void this.refresh();
      }
    }
  }
}
