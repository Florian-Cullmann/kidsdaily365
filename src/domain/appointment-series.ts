import { z } from "zod";
import { appointmentCandidates, appointmentRange } from "./appointment-time";
import { appointmentDetails } from "./management";

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const seriesScheduleSchema = z.object({
  startLocal: localTime, endLocal: localTime.nullable(), until: z.iso.date(),
});
export const createSeriesSchema = seriesScheduleSchema.extend({
  ...appointmentDetails, requestId: z.uuid(), childId: z.uuid(), title: z.string().trim().min(1).max(80),
  icon: z.enum(["calendar", "tooth", "ball", "heart"]),
  choices: z.record(z.string().regex(/^(start|end):\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), z.iso.datetime()).refine((value) => Object.keys(value).length <= 106).default({}),
}).strict();
export type SeriesInput = z.infer<typeof createSeriesSchema>;

function shift(local: string, days: number) {
  const date = new Date(`${local}:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== local) throw new Error("Bitte gültige Datumsangaben eingeben.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 16);
}

/** Bounded calendar expansion shared by preview and server; never adds UTC weeks. */
export function previewSeries(input: z.infer<typeof seriesScheduleSchema>, timezone: string) {
  const schedule = seriesScheduleSchema.parse(input);
  shift(schedule.startLocal, 0);
  if (schedule.endLocal) shift(schedule.endLocal, 0);
  const first = schedule.startLocal.slice(0, 10);
  const anniversary = new Date(`${first}T12:00:00Z`);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  // Leap-day anniversary is February 28 in a non-leap year.
  if (anniversary.getUTCMonth() !== Number(first.slice(5, 7)) - 1) anniversary.setUTCDate(0);
  if (schedule.until < first || schedule.until > anniversary.toISOString().slice(0, 10)) throw new Error("Das Serienende muss zwischen dem ersten Termin und höchstens einem Jahr danach liegen.");
  const result = [];
  for (let index = 0; index < 54; index++) {
    const startLocal = shift(schedule.startLocal, index * 7);
    if (startLocal.slice(0, 10) > schedule.until) break;
    if (index === 53) throw new Error("Eine Serie darf höchstens 53 Termine enthalten.");
    const endLocal = schedule.endLocal ? shift(schedule.endLocal, index * 7) : null;
    const starts = appointmentCandidates(startLocal, timezone);
    const ends = endLocal ? appointmentCandidates(endLocal, timezone) : [];
    if (!starts.length || (endLocal && !ends.length)) throw new Error(`Die Uhrzeit ${!starts.length ? startLocal : endLocal} existiert in ${timezone} nicht. Bitte Beginn oder Ende der Serie anpassen.`);
    result.push({ index, startLocal, endLocal, starts, ends });
  }
  return result;
}

export function resolveSeries(input: SeriesInput, timezone: string) {
  const choose = (local: string, candidates: string[], edge: "start" | "end") => {
    if (candidates.length === 1) return candidates[0];
    const choice = input.choices[`${edge}:${local}`];
    if (!candidates.includes(choice)) throw new Error(`Bitte für ${local} ausdrücklich eine der beiden Uhrzeiten auswählen.`);
    return choice;
  };
  return previewSeries(input, timezone).map((item) => ({ index: item.index, ...appointmentRange(
    choose(item.startLocal, item.starts, "start"), item.endLocal ? choose(item.endLocal, item.ends, "end") : null,
  ) }));
}
