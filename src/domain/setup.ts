/** Derive setup from persisted household records, never from dismissed UI steps. */
export type SetupData = {
  children: { id: string; active: boolean }[];
  routines: { childId: string; active: boolean; steps: readonly unknown[] }[];
  devices: { kind: string; revokedAt: string | null; expiresAt: string }[];
};

export function setupStatus(data: SetupData, now: number) {
  const activeChildren = new Set(data.children.filter((child) => child.active).map((child) => child.id));
  const child = activeChildren.size > 0;
  const routine = data.routines.some((item) => item.active && activeChildren.has(item.childId) && item.steps.length > 0);
  const wall = data.devices.some((device) => device.kind === "wall" && device.revokedAt === null && Date.parse(device.expiresAt) > now);
  return { child, routine, wall, complete: child && routine && wall };
}
