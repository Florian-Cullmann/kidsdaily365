import { localDate, type Appointment } from "./plan";

// An appointment without an end is a reminder for its family-local day,
// not an assertion that the activity is still running.
export function appointmentStatus(item: Appointment, now: Date, timezone: string): "upcoming" | "running" | "today" | "past" {
  if (new Date(item.startsAt) > now) return "upcoming";
  if (item.endsAt) return new Date(item.endsAt) > now ? "running" : "past";
  return localDate(new Date(item.startsAt), timezone) === localDate(now, timezone) ? "today" : "past";
}
