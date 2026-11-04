import { localDate, type Appointment } from "./plan";

export function relevantAppointments(items: Appointment[], timezone: string, now: Date): Appointment[] {
  return items.filter((item) => appointmentStatus(item, now, timezone) !== "past").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function appointmentLabel(item: Appointment, timezone: string, now: Date | null): string {
  const start = new Date(item.startsAt);
  if (now) {
    if (appointmentStatus(item, now, timezone) === "running") return "Jetzt";
    if (localDate(start, timezone) === localDate(now, timezone)) return "Heute";
  }
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(start);
}


// An appointment without an end is a reminder for its family-local day,
// not an assertion that the activity is still running.
export function appointmentStatus(item: Appointment, now: Date, timezone: string): "upcoming" | "running" | "today" | "past" {
  if (new Date(item.startsAt) > now) return "upcoming";
  if (item.endsAt) return new Date(item.endsAt) > now ? "running" : "past";
  return localDate(new Date(item.startsAt), timezone) === localDate(now, timezone) ? "today" : "past";
}
