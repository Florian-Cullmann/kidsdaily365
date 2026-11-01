# Nativer Android-Launcher · Vorschau

Die native Kotlin-App verbindet sich mit dem Backend, zeigt Buddy und Live-Sterne eines fest zugeordneten Kindes und öffnet freigegebene installierte Apps. Aufgabenabschluss, Elternverwaltung und Käufe sind nicht vorhanden. **Das Gerät ist noch nicht durch KidsDaily geschützt.** Ein normaler HOME-Einstieg ist vorhanden; Device Owner, Lock Task, System-/Kamerasperren, Boot-Wiederherstellung und Eltern-Recovery bleiben in [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2) offen. Keine Provisionierung oder Rücksetzung eines Familienhandys in diesem Schritt.

## Bauen und prüfen

JDK 17 und Android SDK 36; Android Studio kann diesen Ordner öffnen. SDK-Pfad über `ANDROID_HOME` oder eine ignorierte `local.properties` setzen.

```sh
./gradlew testDebugUnitTest assembleDebug lintDebug assembleRelease lintRelease
```

Die installierbare Debug-APK liegt unter `app/build/outputs/apk/debug/app-debug.apk`; der Release-Build ist unsigniert. AGP 8.13.2, Kotlin 2.2.21, Gradle 8.14.6, Android 13/API 33 als Minimum, compile/target SDK 36. Coroutines Android 1.11.0 übernimmt Hintergrundarbeit und Lifecycle-Abbruch. JUnit und `org.json` werden nur für JVM-Tests verwendet.

GitHub Actions prüft beide Varianten und stellt nach erfolgreichem Android-Job die Debug-APK als `kidsdaily-android-debug` bereit (sieben Tage). Das Artefakt ist zum Testen gedacht und enthält keine Serveradresse oder Zugangsdaten.

## Verbinden

1. APK bewusst auf einem Entwicklungsgerät/Emulator installieren und öffnen. Die Installation aktiviert keine Systemsperren.
2. Im Eltern-Webbereich ein Kinderprofil anlegen und unter Geräte einen **Android**-Code für dieses Kind erstellen. Ein Wandgerätecode funktioniert hier nicht. Codes gelten zehn Minuten und sind einmalig.
3. In der App die Serveradresse ohne Pfad und den Gerätecode eingeben. Kein Elternpasswort, kein erster Registrierungscode. Standard ist HTTPS mit gültigem Zertifikat; keine TLS-Ausnahmen oder HTTP-Weiterleitungen.
4. Für lokale Entwicklung erlaubt **nur die Debug-App** zusätzlich HTTP mit einer privaten IPv4-/Loopback-Adresse. Im Standard-Android-Emulator etwa `http://10.0.2.2:3000`, auf dem Handy die LAN-IP des Servers. Eine öffentliche HTTP-Adresse oder ein Hostname über HTTP wird abgewiesen. Der Release-Build erlaubt ausschließlich HTTPS. HTTP-Debug-Kopplung nur mit Testdaten in einem vertrauenswürdigen Entwicklungsnetz verwenden.
5. Buddy, Sterne und Freigaben werden im Vordergrund alle fünf Sekunden erneut gelesen. Fehlende Apps erscheinen deaktiviert mit „nicht installiert“; die App installiert nichts automatisch. Änderungen erfolgen ausschließlich im Eltern-Webbereich bzw. am Wandbildschirm.
6. Gerätezugang im Elternbereich widerrufen: Beim nächsten Abruf verschwinden Token und Kinder-Cache; die App verlangt einen neuen Code. „Verbindung trennen“ löscht lokal dieselben Daten. Diese Funktion ist in der ungeschützten Vorschau frei erreichbar; später braucht sie Eltern-Recovery.

Außerhalb des LAN braucht das Telefon einen erreichbaren HTTPS-Zugang/VPN. Es gibt keinen Cloud-Relay und keinen Offline-Widerruf ohne Serverkontakt.

## Aufbau und Grenzen

- `LauncherProtocol`: strikte Version-1-Validierung einschließlich Identität, Berechtigungen und Paketnamen. Gemeinsame fiktive Vertragsdatei unter `contracts/`, geprüft durch Kotlin und Zod.
- `HttpLauncherApi`: feste Pairing-/Snapshot-Pfade, Bearer statt Browsercookies, Zeit-/Größenlimits, keine Weiterleitungen und kein Zertifikats-Bypass.
- `ConnectedLauncher`: anwendungsweite, serialisierte Kopplung/Synchronisierung/Trennung. Die Geräte-ID bleibt gebunden, die Kinder-ID ab dem ersten Snapshot ebenfalls. Bereits eingelöste Codes überleben einen fehlgeschlagenen ersten Datenabruf.
- `KeystorePrivateStore`: AES-256-GCM mit nicht exportierbarem Android-Keystore-Schlüssel und atomarem Dateiersatz im privaten, vom Backup ausgeschlossenen Speicher. Kein Klartext-Token in Preferences, Bundle oder Logs. Der Code wird nach Absenden verworfen und die Eingabeseite vor Screenshots/Recents-Vorschauen geschützt.
- `MainActivity`: ruhige native Buddy-/Sterne-Ansicht, nur App-Starts; kein WebView, keine Aufgaben oder Geschwisterdaten. Hintergrundabrufe pausieren außerhalb der Activity. Vor einem Start wird die aktuelle lokale Freigabe erneut geprüft.

Offline bleibt der letzte gültige Stand sichtbar. Freigegebene Apps lassen sich höchstens 24 Stunden nach Empfang öffnen; die Frist läuft über monotone Gerätezeit, eine zurückgestellte Uhr verlängert sie nicht. Nach Geräte-Neustart oder unbekannter Boot-Zählung ist zunächst eine erfolgreiche Online-Bestätigung nötig. Ein normaler Prozessneustart im selben Geräte-Boot erhält den Cache. Ungültige Antworten verwerfen die bisherige Startliste dauerhaft, statt zusätzliche Apps freizugeben. Eine gültige neue Antwort kann sie wiederherstellen. Keine dieser UI-Regeln ersetzt Lock Task oder sichert den Rest des Systems ab.

Zielgerät: Xiaomi/HyperOS; erste physische Tests: Xiaomi/LineageOS. Modell, Android-Version, Patchstand und Bootloader-/Root-Zustand pro Test dokumentieren. Emulator und Compiler sind kein Nachweis der Gerätesperren. Siehe [Android-Konzept](../../docs/android.md) und [Testleitfaden](../../docs/testing.md).
