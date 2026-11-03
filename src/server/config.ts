import "server-only";
import { appMode as readAppMode, liveConfig as readLiveConfig } from "./configuration";

export function appMode() {
  return readAppMode(process.env);
}

export function liveConfig() {
  return readLiveConfig(process.env);
}
