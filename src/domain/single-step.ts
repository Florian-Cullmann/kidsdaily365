import type { Task } from "./plan";

// Derive from the shared plan, including updates from another device.
export function currentStep(tasks: Task[], selectedId: string | null): Task | undefined {
  const index = tasks.findIndex((task) => task.id === selectedId);
  if (index >= 0 && !tasks[index].completed) return tasks[index];
  return tasks.slice(index + 1).find((task) => !task.completed)
    ?? tasks.find((task) => !task.completed);
}
