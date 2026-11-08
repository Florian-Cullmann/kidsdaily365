export type DaySection = "morning" | "afternoon" | "evening";
export type TaskIcon = "sun" | "toothbrush" | "backpack" | "book" | "moon" | "heart";
export type BuddyKind = "fox" | "rabbit" | "bear";
export type ChildProfile = {
  equippedAccessories?: string[];
  imageUrl?: string | null;
  id: string; name: string; avatar: string; reducedMotion: boolean;
  buddyKind: BuddyKind; buddyName: string; buddyInitialized?: boolean;
};
export type Appointment = { id: string; title: string; startsAt: string; endsAt?: string | null; icon: "calendar" | "tooth" | "ball" | "heart" };
export type RewardRequest = { id: string; childId: string; rewardId: string; title: string; cost: number; status: "pending" | "approved" | "rejected"; createdAt: string; decidedAt: string | null };
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
  paused?: boolean;
  corrected?: boolean;
};
export type DayPlan = {
  date: string;
  timezone: string;
  child: ChildProfile;
  tasks: Task[];
  balance: number;
  earnedTotal?: number;
  rewardRequests?: RewardRequest[];
  appointments: Appointment[];
  rewards: Reward[];
  savingsGoalId?: string | null;
};

export const sections: { id: DaySection; label: string; caption: string }[] = [
  { id: "morning", label: "Mein Morgen", caption: "Gut in den Tag starten" },
  { id: "afternoon", label: "Mein Nachmittag", caption: "Zeit für Neues und für dich" },
  { id: "evening", label: "Mein Abend", caption: "Den Tag entspannt beenden" },
];

// Preserve the plan's order within each section and routine, including completed tasks.
export function groupTasksBySection(tasks: Task[]) {
  return sections.flatMap((section) => {
    const groups = new Map<string, { id: string; tasks: Task[] }>();
    for (const task of tasks) {
      if (task.section !== section.id) continue;
      const id = task.routineId ? `routine:${task.routineId}` : `task:${task.id}`;
      const group = groups.get(id);
      if (group) group.tasks.push(task);
      else groups.set(id, { id, tasks: [task] });
    }
    return groups.size ? [{ ...section, groups: [...groups.values()] }] : [];
  });
}

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
  if (!task || task.completed || task.paused || task.corrected) return plan;
  return {
    ...plan,
    balance: plan.balance + task.points,
    earnedTotal: (plan.earnedTotal ?? plan.balance) + task.points,
    tasks: plan.tasks.map((item) => item.id === taskId ? { ...item, completed: true } : item),
  };
}

/** Paused steps are visible, but never counted as completed or as outstanding work. */
export function taskProgress(tasks: Task[]) {
  const done = tasks.filter(task => task.completed).length;
  const paused = tasks.filter(task => task.paused && !task.completed).length;
  const corrected = tasks.filter(task => task.corrected).length;
  const total = tasks.length - paused - corrected;
  const open = total - done;
  const baseLabel = total === 0 && paused > 0 ? "Heute Pause" : paused > 0
    ? `${done} geschafft${open ? ` · ${open} offen` : ""} · ${paused} mit Pause`
    : `${done} von ${total} geschafft`;
  const label = corrected ? `${baseLabel} · ${corrected} korrigiert` : baseLabel;
  return { done, paused, total, label };
}
