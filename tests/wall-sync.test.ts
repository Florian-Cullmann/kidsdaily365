import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WallSync } from "@/client/wall-sync";
import { demoPlans } from "@/domain/demo";
import { completeDemoTask } from "@/domain/plan";

const instant = new Date("2026-11-04T12:00:00Z");
const plans = () => demoPlans(instant);
const snapshot = (data = plans()) => Response.json({ plans: data, syncedAt: new Date().toISOString() });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const controllers: WallSync[] = [];
function create(fetcher: typeof fetch) {
  const sync = new WallSync(plans(), instant.toISOString(), fetcher);
  controllers.push(sync); return sync;
}
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(instant); });
afterEach(() => { controllers.splice(0).forEach((sync) => sync.stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("wall synchronization", () => {
  it("shows a pending retry until it succeeds and ignores an aborted older request", async () => {
    const old = deferred<Response>(); const retry = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(retry.promise);
    const sync = create(fetcher); sync.start();
    sync.offline();
    expect(sync.getSnapshot()).toMatchObject({ phase: "offline", refreshing: false });
    const pending = sync.refresh();
    expect(sync.getSnapshot()).toMatchObject({ phase: "offline", refreshing: true });
    old.resolve(snapshot()); await flush();
    expect(sync.getSnapshot().refreshing).toBe(true);
    retry.resolve(snapshot()); await pending;
    expect(sync.getSnapshot()).toMatchObject({ phase: "connected", refreshing: false });
  });

  it("polls profiles without a selection, coalesces requests and pauses reads while hidden", async () => {
    const first = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockResolvedValue(snapshot([]));
    const sync = create(fetcher); sync.start();
    void sync.refresh(); void sync.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    first.resolve(snapshot()); await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sync.getSnapshot().plans).toEqual([]);
    vi.stubGlobal("document", { visibilityState: "hidden" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.stubGlobal("document", { visibilityState: "visible" });
    await sync.refresh();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("discards an older poll even if it ignores abort and arrives after a confirmed write", async () => {
    const old = deferred<Response>(); const post = deferred<Response>(); const fresh = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(post.promise).mockReturnValueOnce(fresh.promise);
    const sync = create(fetcher); sync.start();
    const plan = plans()[0]; const task = plan.tasks[0];
    const completion = sync.complete(task.id);
    expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    void sync.refresh(); // No overlapping read while the write is in flight.
    expect(fetcher).toHaveBeenCalledTimes(2);
    const updated = completeDemoTask(plan, task.id);
    post.resolve(Response.json({ childId: plan.child.id, awarded: 5, plan: updated }));
    expect(await completion).toEqual({ childId: plan.child.id, awarded: 5 });
    old.resolve(snapshot()); await flush();
    expect(sync.getSnapshot().plans[0].balance).toBe(5);
    expect(sync.getSnapshot().plans[0].tasks[0].completed).toBe(true);
    fresh.resolve(snapshot([updated, plans()[1]])); await flush();
    expect(sync.getSnapshot().plans[0].balance).toBe(5);
  });

  it("keeps cached content offline and reconciles an ambiguous write without resending it", async () => {
    const plan = plans()[0]; const updated = completeDemoTask(plan, plan.tasks[0].id);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new TypeError("lost response"))
      .mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(snapshot([updated, plans()[1]]));
    const sync = create(fetcher); sync.start(); await flush();
    expect(await sync.complete(plan.tasks[0].id)).toHaveProperty("error"); await flush();
    expect(sync.getSnapshot().phase).toBe("offline");
    expect(sync.getSnapshot().plans).toEqual(plans());
    await sync.refresh();
    expect(sync.getSnapshot().phase).toBe("connected");
    expect(sync.getSnapshot().plans[0].balance).toBe(5);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each([401, 403])("wipes protected state and stops polling on %s, including late responses", async (status) => {
    const delayed = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(delayed.promise).mockResolvedValueOnce(new Response(null, { status }));
    const sync = create(fetcher); sync.start();
    sync.offline(); await sync.refresh();
    expect(sync.getSnapshot()).toMatchObject({ phase: "revoked", plans: [], syncedAt: null });
    delayed.resolve(snapshot()); await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sync.getSnapshot().plans).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("detects family midnight without a selected profile and refuses stale task writes offline", async () => {
    vi.setSystemTime(new Date("2026-11-04T22:59:59Z")); // Berlin: one second before midnight.
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const sync = create(fetcher); sync.start(); await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync.getSnapshot().dayChanged).toBe(true);
    expect(sync.getSnapshot().plans[0].date).toBe("2026-11-04");
    await sync.complete(plans()[0].tasks[0].id);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
    fetcher.mockResolvedValue(snapshot(demoPlans(new Date())));
    await sync.refresh();
    expect(sync.getSnapshot().dayChanged).toBe(false);
    expect(sync.getSnapshot().plans[0].date).toBe("2026-11-05");
  });

  it("rejects a stale task immediately at midnight even before the periodic check", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(snapshot());
    const sync = create(fetcher); sync.start(); await flush();
    vi.setSystemTime(new Date("2026-11-04T23:00:00Z"));
    expect(await sync.complete(plans()[0].tasks[0].id)).toHaveProperty("error");
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("does not restore a revoked wall from a pending completion or a previous mount", async () => {
    const post = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(snapshot()).mockReturnValueOnce(post.promise).mockResolvedValueOnce(new Response(null, { status: 401 }));
    const sync = create(fetcher); sync.start(); await flush();
    const plan = plans()[0];
    const completion = sync.complete(plan.tasks[0].id);
    sync.stop(); sync.start(); await flush();
    expect(sync.getSnapshot().phase).toBe("revoked");
    post.resolve(Response.json({ childId: plan.child.id, awarded: 5, plan: completeDemoTask(plan, plan.tasks[0].id) }));
    expect(await completion).toBeNull();
    expect(sync.getSnapshot().plans).toEqual([]);
  });

  it("times out a stalled fetch and cancels outstanding work on unmount", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const sync = create(fetcher); sync.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sync.getSnapshot()).toMatchObject({ phase: "offline", refreshing: false });
    void sync.refresh(); sync.stop(); await flush();
    expect((fetcher.mock.calls[1][1]?.signal as AbortSignal).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});


it("serializes reward requests with completions and ignores older polls", async () => {
  const old = deferred<Response>(); const post = deferred<Response>(); const fresh = deferred<Response>();
  const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(post.promise).mockReturnValueOnce(fresh.promise);
  const sync = create(fetcher); sync.start();
  const plan = plans()[0];
  const pending = sync.requestReward(plan.child.id, "reward", "retry-id");
  expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  expect(await sync.complete(plan.tasks[0].id)).toBeNull();
  expect(await sync.requestReward(plan.child.id, "reward", "retry-id")).toBeNull();
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ rewardId: "reward", requestId: "retry-id" });
  const updated = { ...plan, balance: 42 };
  post.resolve(Response.json({ plan: updated }));
  expect(await pending).toEqual({ childId: plan.child.id, awarded: 0 });
  old.resolve(snapshot()); await flush();
  expect(sync.getSnapshot().plans[0].balance).toBe(42);
  fresh.resolve(snapshot([updated])); await flush();
});


it("saves and clears goals through the shared writer without changing the balance", async () => {
  const post = deferred<Response>(); const fresh = deferred<Response>();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(snapshot()).mockReturnValueOnce(post.promise).mockReturnValueOnce(fresh.promise);
  const sync = create(fetcher); sync.start(); await flush();
  const plan = plans()[0];
  const saving = sync.saveGoal(plan.child.id, "goal");
  expect(await sync.requestReward(plan.child.id, "reward", "retry-id")).toBeNull();
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ rewardId: "goal" }) });
  const updated = { ...plan, savingsGoalId: "goal" };
  post.resolve(Response.json({ plan: updated })); await saving;
  expect(sync.getSnapshot().plans[0]).toMatchObject({ savingsGoalId: "goal", balance: plan.balance });
  fresh.resolve(snapshot([updated])); await flush();
  fetcher.mockResolvedValueOnce(Response.json({ plan: { ...plan, savingsGoalId: null } })).mockResolvedValueOnce(snapshot());
  await sync.saveGoal(plan.child.id, null);
  expect(fetcher.mock.calls[3][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ rewardId: null }) });
  expect(sync.getSnapshot().plans[0].savingsGoalId).toBeNull();
});

it("reconciles a lost buddy response from the persisted snapshot without optimistic success", async () => {
  const pending = plans(); pending[0].child.buddyInitialized = false;
  const stored = structuredClone(pending);
  Object.assign(stored[0].child, { buddyInitialized: true, buddyKind: "bear", buddyName: "Bruno" });
  const reconciliation = deferred<Response>();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(snapshot(pending))
    .mockRejectedValueOnce(new TypeError("lost response"))
    .mockReturnValueOnce(reconciliation.promise);
  const sync = create(fetcher); sync.start(); await flush();
  const result = await sync.setupBuddy(pending[0].child.id, "rabbit", "Lumi");
  expect(result).toMatchObject({ error: expect.stringContaining("Bestätigung fehlt") });
  expect(sync.getSnapshot().plans[0].child.buddyInitialized).toBe(false);
  reconciliation.resolve(snapshot(stored)); await flush();
  expect(sync.getSnapshot().plans[0].child).toMatchObject({ buddyInitialized: true, buddyName: "Bruno" });
  expect(sync.getSnapshot().plans[0].tasks).toEqual(pending[0].tasks);
});
