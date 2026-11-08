import type { ManagementData } from "@/server/management";

const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const sections = { morning: "Morgen", afternoon: "Nachmittag", evening: "Abend" };

type RoutineScheduleData = Pick<ManagementData["routines"][number], "weekdays" | "section" | "scheduledTime">;

export function RoutineSchedule({ routine }: { routine: RoutineScheduleData }) {
  const days = weekdays.filter((_, index) => routine.weekdays.includes(index + 1));
  return <p>
    {days.length === 7 ? "Täglich" : days.join(", ")}
    <br />
    {sections[routine.section]} · {routine.scheduledTime ? <time dateTime={routine.scheduledTime.slice(0, 5)}>{routine.scheduledTime.slice(0, 5)} Uhr</time> : "Ohne feste Uhrzeit"}
  </p>;
}
