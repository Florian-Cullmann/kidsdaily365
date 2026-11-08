import { z } from "zod";

export const previewDate = z.iso.date().refine((date) => date >= "2000-01-01" && date <= "2100-12-31", "Bitte ein Datum zwischen 2000 und 2100 wählen.");
export function shiftDate(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  return shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
