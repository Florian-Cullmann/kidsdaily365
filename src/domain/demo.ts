import { localDate, type DayPlan } from "./plan";

export function demoPlans(now = new Date()): DayPlan[] {
  return [
    { id: "demo-mika", name: "Mika", avatar: "M", reducedMotion: true, buddyKind: "fox" as const, buddyName: "Fino" },
    { id: "demo-leni", name: "Leni", avatar: "L", reducedMotion: true, buddyKind: "rabbit" as const, buddyName: "Lumi" },
  ].map((child) => ({
    date: localDate(now, "Europe/Berlin"),
    timezone: "Europe/Berlin",
    child,
    balance: 0,
    appointments: [{ id: `${child.id}-visit`, title: child.id === "demo-mika" ? "Fußball" : "Musikstunde", startsAt: new Date(now.getTime() + 3_600_000).toISOString(), icon: "calendar" }],
    rewards: [{ id: "demo-reward-1", title: "Gemeinsame Spielzeit", cost: 50 }, { id: "demo-reward-2", title: "Ausflug zum Spielplatz", cost: 100 }],
    tasks: [
      { id: `${child.id}-1`, title: "In Ruhe frühstücken", description: "Such dir etwas Leckeres aus und tanke Energie.", icon: "sun", section: "morning", time: "07:00", points: 5, completed: false },
      { id: `${child.id}-2`, title: "Zähne putzen", description: "Zahnbürste, Zahnpasta – los geht’s.", icon: "toothbrush", section: "morning", time: "07:20", points: 5, completed: false },
      { id: `${child.id}-3`, title: "Rucksack bereitmachen", description: "Trinkflasche und Brotdose dabei?", icon: "backpack", section: "morning", time: "07:30", points: 10, completed: false },
      { id: `${child.id}-4`, title: "Lesezeit", description: "Mach es dir mit deinem Lieblingsbuch gemütlich.", icon: "book", section: "afternoon", time: "15:00", points: 10, completed: false },
      { id: `${child.id}-5`, title: "Zeit zum Runterkommen", description: "Ein ruhiger Moment, so wie du ihn magst.", icon: "moon", section: "evening", time: "19:00", points: 5, completed: false },
    ],
  }));
}
