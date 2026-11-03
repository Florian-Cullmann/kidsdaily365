import { localDate, type Appointment } from "./plan";

export function relevantAppointments(items: Appointment[], timezone: string, now: Date): Appointment[] {
  const today = localDate(now, timezone);
  return items.filter((item) => item.endsAt
    ? new Date(item.endsAt).getTime() > now.getTime()
    : localDate(new Date(item.startsAt), timezone) >= today,
  ).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function appointmentLabel(item: Appointment, timezone: string, now: Date | null): string {
  const start = new Date(item.startsAt);
  if (now) {
    if (item.endsAt && start <= now && now < new Date(item.endsAt)) return "Jetzt";
    if (localDate(start, timezone) === localDate(now, timezone)) return "Heute";
  }
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(start);
}
