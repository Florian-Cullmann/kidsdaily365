import { z } from "zod";

export const messageInput = z.object({ requestId: z.uuid(), body: z.string().trim().min(1).max(2000) }).strict();
export const usageEvent = z.object({
  key: z.string().min(1).max(160), at: z.iso.datetime(),
  kind: z.enum(["resume", "pause", "screen-on", "screen-off", "shutdown"]),
  packageName: z.string().max(255), label: z.string().max(120),
}).strict();
export const syncInput = z.object({
  revision: z.number().int().min(-1).max(2147483646), appliedLocked: z.boolean(),
  localRelease: z.boolean().default(false), ready: z.boolean(), usagePermission: z.boolean(),
  usageSince: z.iso.datetime().nullable(), usageThrough: z.iso.datetime().nullable(),
  error: z.string().max(300).nullable(), events: z.array(usageEvent).max(40),
}).strict();
export type UsageEvent = { at: string; kind: string; packageName: string; label: string };
/** Only observed intervals count; unknown initial states are never assumed to be usage. */
export function summarizeUsage(events: UsageEvent[], from: number, through: number, timezone: string) {
  let screen: number | null = null;
  let foreground: { at: number; packageName: string; label: string } | null = null;
  let screenMs = 0;
  const sessions: { packageName: string; label: string; start: string; end: string; milliseconds: number }[] = [];
  const days: Record<string, number> = {};
  const date = (t: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  function addScreen(end: number) {
    if (screen === null) return;
    let start = Math.max(screen, from); end = Math.min(end, through);
    screenMs += Math.max(0, end - start);
    // Split at minute boundaries: also handles DST and non-whole-hour timezones.
    while (start < end) { const next = Math.min(end, (Math.floor(start / 60000) + 1) * 60000); const day = date(start); days[day] = (days[day] ?? 0) + next - start; start = next; }
  }
  function closeApp(end: number) {
    if (!foreground) return;
    const start = Math.max(from, foreground.at); end = Math.min(end, through);
    if (end > start) sessions.push({ ...foreground, start: new Date(start).toISOString(), end: new Date(end).toISOString(), milliseconds: end - start });
    foreground = null;
  }
  for (const event of events) {
    const at = Date.parse(event.at); if (at > through) break;
    if (event.kind === "screen-on") { if (screen === null) screen = at; }
    if (event.kind === "screen-off" || event.kind === "shutdown") { addScreen(at); screen = null; closeApp(at); }
    if (event.kind === "resume") { closeApp(at); foreground = { at, packageName: event.packageName, label: event.label }; }
    if (event.kind === "pause" && foreground?.packageName === event.packageName) closeApp(at);
  }
  addScreen(through); closeApp(through);
  const apps = new Map<string, { packageName: string; label: string; milliseconds: number; opens: number }>();
  for (const s of sessions) { const app = apps.get(s.packageName) ?? { packageName: s.packageName, label: s.label, milliseconds: 0, opens: 0 }; app.milliseconds += s.milliseconds; app.opens++; apps.set(s.packageName, app); }
  return { screenMs, days, apps: [...apps.values()].sort((a, b) => b.milliseconds - a.milliseconds), sessions: sessions.reverse() };
}
