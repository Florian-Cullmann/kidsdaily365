import { z } from "zod";

export const routinePauseInput = z.object({
  requestId: z.uuid(), startsOn: z.iso.date(), endsOn: z.iso.date(),
  reason: z.string().trim().max(120).default(""),
}).strict();

export function dateInPause(date: string, pause: { startsOn: string; endsOn: string }) {
  return date >= pause.startsOn && date <= pause.endsOn;
}
