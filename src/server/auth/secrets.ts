import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { liveConfig } from "../config";

export const newToken = () => randomBytes(32).toString("base64url");
export const digestToken = (token: string) => createHmac("sha256", liveConfig().SESSION_SECRET).update(token).digest("hex");
