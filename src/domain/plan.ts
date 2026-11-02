export type DaySection = "morning" | "afternoon" | "evening";
export type TaskIcon = "sun" | "toothbrush" | "backpack" | "book" | "moon" | "heart";
export type BuddyKind = "fox" | "rabbit" | "bear";
export type ChildProfile = {
  id: string; name: string; avatar: string; reducedMotion: boolean;
  buddyKind: BuddyKind; buddyName: string;
};
export type Appointment = { id: string; title: string; startsAt: string; icon: "calendar" | "tooth" | "ball" | "heart" };
export type Reward = { id: string; title: string; cost: number };
export type Task = {
  routineId?: string | null;
  routineTitle?: string | null;
  id: string;
  title: string;
  description: string;
  icon: TaskIcon;
  section: DaySection;
  time: string | null;
  points: number;
  completed: boolean;
};
export type DayPlan = {
  date: string;
  timezone: string;
  child: ChildProfile;
  tasks: Task[];
  balance: number;
  appointments: Appointment[];
  rewards: Reward[];
};

export const sections: { id: DaySection; label: string; caption: string }[] = [
  { id: "morning", label: "Mein Morgen", caption: "Gut in den Tag starten" },
  { id: "afternoon", label: "Mein Nachmittag", caption: "Zeit für Neues und für dich" },
  { id: "evening", label: "Mein Abend", caption: "Den Tag entspannt beenden" },
];

export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Also used by demo mode. Completing the same task twice must be a no-op.
export function completeDemoTask(plan: DayPlan, taskId: string): DayPlan {
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task || task.completed) return plan;
  return {
    ...plan,
    balance: plan.balance + task.points,
    tasks: plan.tasks.map((item) => item.id === taskId ? { ...item, completed: true } : item),
  };
}
