/** Convert only through the explicit household zone, never the host's local zone. */
export function appointmentLocalInput(iso: unknown, timeZone: string): string {
  if (typeof iso !== "string" || !Number.isFinite(Date.parse(iso))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function appointmentCandidates(local: string, timeZone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return [];
  const wall = Date.parse(`${local}:00.000Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== local) return [];
  // Sample offsets on both sides of transitions, including non-hour and date-line shifts.
  const offsets = new Set<number>();
  for (let hour = -48; hour <= 48; hour += 6) {
    const sample = wall + hour * 3_600_000;
    offsets.add(Date.parse(`${appointmentLocalInput(new Date(sample).toISOString(), timeZone)}:00Z`) - sample);
  }
  return [...offsets].map((offset) => new Date(wall - offset).toISOString())
    .filter((iso) => appointmentLocalInput(iso, timeZone) === local).sort();
}

export function appointmentInstant(local: string, timeZone: string, selected: string, original?: unknown): string {
  const candidates = appointmentCandidates(local, timeZone);
  if (!candidates.length) throw new Error(`Diese Uhrzeit existiert in ${timeZone} nicht. Bitte wähle eine andere Uhrzeit.`);
  if (!candidates.includes(selected)) throw new Error("Bitte wähle aus, welche der beiden Uhrzeiten gemeint ist.");
  // Preserve sub-minute precision and the original occurrence on an unchanged edit.
  if (typeof original === "string" && appointmentLocalInput(original, timeZone) === local
    && new Date(original).toISOString().slice(0, 16) === selected.slice(0, 16)) return original;
  return selected;
}

export function appointmentRange(startsAt: string, endsAt: string | null) {
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("Das Ende muss nach dem Beginn liegen.");
  return { startsAt, endsAt };
}
