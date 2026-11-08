import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appMode, liveConfig, type ConfigEnvironment } from "@/server/configuration";

const valid = {
  APP_MODE: "live", APP_ORIGIN: "https://family.example.test",
  DATABASE_URL: "postgres://fictional:private-password@unreachable.invalid/family",
  FAMILY_ID: "11111111-1111-4111-8111-111111111111",
  SETUP_CODE: "fictional-setup-code-for-tests", SESSION_SECRET: "fictional-session-secret-for-tests-only",
};
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function cli(environment: ConfigEnvironment, dotenv?: string) {
  const cwd = mkdtempSync(join(tmpdir(), "kidsdaily-config-test-"));
  directories.push(cwd);
  if (dotenv !== undefined) writeFileSync(join(cwd, ".env"), dotenv);
  // Deliberately exclude the developer's configuration and Node/dotenv overrides.
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH };
  Reflect.deleteProperty(env, "NODE_ENV"); // Exercise the real default despite Next's required NODE_ENV type.
  Object.assign(env, environment);
  return spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/check-config.ts")], {
    cwd, env, encoding: "utf8", timeout: 10_000,
  });
}

describe("shared application configuration", () => {
  it("keeps mode defaults and explicit overrides", () => {
    expect(appMode({})).toBe("demo");
    expect(appMode({ NODE_ENV: "production" })).toBe("live");
    expect(appMode({ NODE_ENV: "production", APP_MODE: "demo" })).toBe("demo");
    expect(() => appMode({ APP_MODE: "private-mode-value" })).toThrow("APP_MODE muss demo oder live sein.");
  });
  it("accepts live configuration with the existing family defaults", () => {
    expect(liveConfig(valid)).toMatchObject({ FAMILY_NAME: "Unsere Familie", FAMILY_TIMEZONE: "Europe/Berlin" });
  });
  it("reports all invalid field names without their values", () => {
    const env = { ...valid, APP_ORIGIN: "private-origin", FAMILY_TIMEZONE: "private-zone", SETUP_CODE: "private-code", SESSION_SECRET: "private-secret" };
    expect(() => liveConfig(env)).toThrow("Konfiguration fehlt/ungültig: APP_ORIGIN, SETUP_CODE, SESSION_SECRET, FAMILY_TIMEZONE");
  });
});

describe("configuration CLI", () => {
  it("runs without .env or live values in demo mode", () => {
    const result = cli({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Konfiguration gültig (demo)");
    expect(result.stderr).toBe("");
  });
  it("loads .env without connecting to the configured unreachable database", () => {
    const result = cli({}, Object.entries(valid).map(([key, value]) => `${key}=${value}`).join("\n"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Konfiguration gültig (live)");
    expect(result.stdout).toContain("keine Datenbank- oder Netzwerkprüfung");
    expect(result.stderr).toBe("");
    for (const value of Object.values(valid).filter(value => value !== "live")) expect(result.stdout).not.toContain(value);
  });
  it("keeps existing environment values ahead of .env", () => {
    const result = cli({ APP_MODE: "demo" }, "APP_MODE=live\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("(demo)");
  });
  it("uses the production default and fails without live configuration", () => {
    const result = cli({ NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("APP_ORIGIN, DATABASE_URL, FAMILY_ID, SETUP_CODE, SESSION_SECRET");
    expect(result.stdout).toBe("");
  });
  it("redacts malformed secrets and URLs in real process output", () => {
    const result = cli({ ...valid, APP_ORIGIN: "private-origin", SETUP_CODE: "private-code", SESSION_SECRET: "private-secret" });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("Konfiguration fehlt/ungültig: APP_ORIGIN, SETUP_CODE, SESSION_SECRET");
    expect(result.stdout).toBe("");
  });
  it("redacts an invalid mode instead of emitting its value or stack trace", () => {
    const result = cli({ APP_MODE: "private-mode-value" });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("APP_MODE muss demo oder live sein.");
    expect(result.stdout).toBe("");
  });
});
