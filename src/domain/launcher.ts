import { z } from "zod";
import { packageNameSchema } from "./management";

export const launcherSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  syncedAt: z.iso.datetime(),
  pollAfterSeconds: z.literal(5),
  device: z.object({ id: z.uuid(), label: z.string() }),
  child: z.object({ id: z.uuid(), name: z.string(), avatar: z.string(), reducedMotion: z.boolean() }),
  stars: z.number().int().nonnegative(),
  buddy: z.object({ kind: z.enum(["fox", "rabbit", "bear"]), name: z.string(), cosmeticIds: z.array(z.string()).length(0) }),
  policy: z.object({
    revision: z.string(),
    allowedApps: z.array(z.object({ packageName: packageNameSchema, label: z.string() })),
    desiredMode: z.literal("managed-launcher"),
    blockCamera: z.literal(true), blockOverview: z.literal(true), blockNotifications: z.literal(true), blockQuickSettings: z.literal(true),
    maxOfflineSeconds: z.literal(86_400),
  }),
  capabilities: z.object({ taskCompletion: z.literal(false), administration: z.literal(false), purchases: z.literal(false) }),
}).strict();
export type LauncherSnapshot = z.infer<typeof launcherSnapshotSchema>;
