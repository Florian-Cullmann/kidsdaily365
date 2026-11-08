import { config } from "dotenv";
import { appMode, ConfigurationError, liveConfig } from "../src/server/configuration";

try {
  // Never print dotenv diagnostics or parsed environment values.
  const loaded = config({ quiet: true, debug: false, override: false });
  if (loaded.error && (loaded.error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw new ConfigurationError("Die lokale .env konnte nicht gelesen werden.");
  }
  const mode = appMode(process.env);
  if (mode === "live") liveConfig(process.env);
  console.info(`Konfiguration gültig (${mode}). Nur Konfiguration geprüft; keine Datenbank- oder Netzwerkprüfung.`);
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : "Konfigurationsprüfung fehlgeschlagen.");
  process.exitCode = 1;
}
