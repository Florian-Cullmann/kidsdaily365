# Android-Launcher: Architektur und Sicherheitsgrenze

## Aktueller Stand

Die Elternverwaltung und die getrennte Launcher-API sind umgesetzt. Eltern können ein Handy genau einem Kinderprofil zuweisen, die App-Freigaben je Kind pflegen und einen Gerätezugang widerrufen. Der Server liefert Sterne, Buddy und Freigaben ausschließlich lesend. Das kompilierbare native Projekt liegt unter `apps/android/`; es koppelt das Handy per Gerätecode, speichert Zugang und Cache Keystore-verschlüsselt und zeigt Buddy, Live-Sterne und freigegebene Apps. Ein getrennt eingerichteter lokaler Eltern-Code öffnet den offlinefähigen Wartungszugang für Verwaltungsaktionen. Die native Ansicht bleibt klar als ungeschützte Vorschau gekennzeichnet.

**Die echte Gerätesperre ist noch nicht implementiert.** Sie wird in [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2) umgesetzt und auf dem tatsächlichen Telefon geprüft. [Buddy-Kosmetik und Käufe](https://github.com/Florian-Cullmann/kidsdaily365/issues/3) sind ein späterer, getrennter Funktionsblock.

## Zielbild

Der Server und die Weboberfläche bleiben ein modularer Monolith. Android ist ein eigener nativer Client mit einem Device Policy Controller (DPC). Das Telefon gehört einem Kind, zeigt dessen Buddy und Sterne und öffnet nur erlaubte installierte Apps. Es gibt dort keine Familien-Profilauswahl, To-do-Liste, Abhakfunktion oder Punktebearbeitung. Eltern verwalten das Gerät im Backend.

Ein gewöhnlicher Launcher kann die gewünschten Systemgrenzen nicht zuverlässig erzwingen. Die Android-Plattform stellt dafür den verwalteten Dedicated-Device-/Device-Owner-Betrieb bereit. Ein Gerät muss dafür ausdrücklich provisioniert werden; ein bereits privat eingerichtetes Telefon kann dafür einen Werksreset benötigen. Eine normale Installation der APK aktiviert diesen Modus nicht. [Android: Dedicated devices](https://developer.android.com/work/dpc/dedicated-devices).

## Zuordnung der Anforderungen

| Wunsch | Geplante native Umsetzung |
| --- | --- |
| Android-Start direkt im Launcher | HOME-Activity, als persistenter bevorzugter Home-Handler durch den DPC eingerichtet; Wiederaufnahme der lokalen Policy beim Start |
| Quadratischer Recents-/Overview-Button und entsprechende Geste gesperrt | Multi-App Lock Task ohne Overview-Freigabe; Home führt zum eigenen Launcher |
| Nur Audible und konfigurierte Apps öffnen | Launcher selbst plus validierte Paketnamen in `setLockTaskPackages`; zusätzliche Aktivitäten innerhalb gesperrter Tasks ab API 30 blockieren |
| Kamera nicht starten können | Geräteweite Kamera-Sperre, keine Kamera-Berechtigung für KidsDaily; zusätzlich Power-Doppelklick und Sperrbildschirm am Modell testen |
| Kontrollzentrum/Quick Settings und Benachrichtigungen nicht herunterziehen | Lock-Task-UI ohne Notification-Freigabe; außerhalb der gesperrten Task ergänzende Statusleisten-Policy |
| Notification History nicht öffnen | Kein Zugriff auf Einstellungen/System-UI; auch Hersteller-Verknüpfungen und Wege aus erlaubten Apps testen |
| Nicht über „Apps beenden“ schließen/deinstallieren | Kein Overview, DPC-Schutz vor Deinstallation und Benutzer-Appkontrolle; Prozessabsturz ist durch Neustart/Home-Wiederherstellung abzufangen |

Lock Task ist von frei beendbarer Bildschirmfixierung zu unterscheiden. Die native Umsetzung muss Allowlisting, Lock-Task-UI und Home-Verhalten gemeinsam konfigurieren. [Android: Lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode), [Custom Home apps](https://developer.android.com/work/dpc/dedicated-devices/cookbook#be_the_home_app).

Für die Umsetzung sind insbesondere `setCameraDisabled`, `setLockTaskFeatures`, `LOCK_TASK_FEATURE_BLOCK_ACTIVITY_START_IN_TASK` und `setUserControlDisabledPackages` relevant. `setStatusBarDisabled` allein wirkt nicht innerhalb von Lock Task und schützt auch nicht den Sperrbildschirm. Das ist ein zusätzlicher Baustein, kein Ersatz für Lock Task. [DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager).

Als Projektbasis gilt **Android 13/API 33 und neuer**, mit `compileSdk/targetSdk 36` für das aktuelle Grundgerüst. Wir bauen keine Rückwärtskompatibilität zu Android 10/11 und beschränken uns zugleich nicht auf die neueste Android-Version. Die benötigten Sperr-APIs sind damit Teil der Mindestplattform. Vor einer Veröffentlichung auf neuen Android-Versionen müssen deren Verhaltensänderungen und Geräte gesondert geprüft werden.

Die DPC-Policy muss außerdem Änderungen an Apps, Nutzerwechseln und unkontrollierten Installationswegen berücksichtigen. Eine Paketliste im Startbildschirm allein ist kein Nachweis einer Systemsperre. [UserManager restrictions](https://developer.android.com/reference/android/os/UserManager#DISALLOW_APPS_CONTROL).

## Verbindung und Backend-Vertrag

Die Einrichtungs- und Build-Schritte stehen in [apps/android/README.md](../apps/android/README.md). Release-Verbindungen verwenden HTTPS mit gültigem Zertifikat. Ausschließlich Debug erlaubt für LAN-Tests auch HTTP mit privater IP-Adresse; kein HTTP-Hostname, kein Redirect und keine TLS-Ausnahme.

### Freigabe

1. Ein angemeldeter Elternteil erstellt unter Geräte einen Android-Code für genau ein aktives Kind.
2. Die App übermittelt `POST /api/device/pair` mit `{ "code": "…", "kind": "android" }`. Native Requests dürfen ohne `Origin` kommen; Browser-Origins müssen der konfigurierten Adresse entsprechen.
3. Der zehn Minuten gültige Code wird atomar einmalig verbraucht. Das Ergebnis enthält einen zufälligen Bearer-Token, Geräte-ID und Ablaufdauer (90 Tage), aber kein Browsercookie.
4. Der Server speichert ausschließlich den HMAC-Hash des Tokens. Widerruf, Ablauf oder Archivierung des Kinderprofils beenden den Zugriff. Ein erneutes Verbinden benötigt wieder einen Eltern-Code.

### Lesen

`GET /api/launcher/snapshot`, Header `Authorization: Bearer <token>`:

```json
{
  "schemaVersion": 1,
  "syncedAt": "2026-11-01T12:00:00.000Z",
  "pollAfterSeconds": 5,
  "device": { "id": "11111111-1111-4111-8111-111111111111", "label": "Mikas Handy" },
  "child": { "id": "22222222-2222-4222-8222-222222222222", "name": "Mika", "avatar": "M", "reducedMotion": true },
  "stars": 35,
  "buddy": { "kind": "fox", "name": "Fino", "cosmeticIds": [] },
  "policy": {
    "revision": "hash-der-app-freigaben",
    "allowedApps": [{ "packageName": "com.audible.application", "label": "Audible" }],
    "desiredMode": "managed-launcher",
    "blockCamera": true,
    "blockOverview": true,
    "blockNotifications": true,
    "blockQuickSettings": true,
    "maxOfflineSeconds": 86400
  },
  "capabilities": { "taskCompletion": false, "administration": false, "purchases": false }
}
```

Der versionierte Zod-Vertrag liegt in `src/domain/launcher.ts`, passende native DTOs in `LauncherModels.kt`, die strikte Validierung in `LauncherProtocol.kt`. Eine gemeinsame fiktive Vertragsdatei unter `contracts/launcher-v1.example.json` wird durch Kotlin und Zod geprüft. Der Snapshot enthält keine Aufgaben, Termine, Elternkonten, Geschwisterdaten oder Passworthashes. `policy` beschreibt den gewünschten Zustand, **nicht den Nachweis**, dass ein Telefon ihn bereits durchsetzt. `revision` ändert sich bei einer Änderung der aktiven App-Liste; andere Snapshot-Felder werden trotzdem bei jedem Abruf neu gelesen.

Die App fragt im Vordergrund alle fünf Sekunden ab. Das ist ein begrenztes Polling-Intervall und noch kein Push/SSE. Der Sternestand kommt ausschließlich vom Server. Gerätestatus und Alter der letzten erfolgreichen Synchronisierung müssen sichtbar sein. Im lokalen LAN ist der Server direkt erreichbar; außerhalb braucht das Telefon einen eingerichteten, HTTPS-geschützten Zugang/VPN. Es gibt keinen automatischen Cloud-Relay.

Neue Kinderprofile erhalten [Audible (`com.audible.application`)](https://play.google.com/store/apps/details?id=com.audible.application) als erste App-Freigabe. Eltern können sie archivieren und weitere exakte Paketnamen freigeben. Platzhalter, URLs und besonders kritische Standard-Systempakete werden im Backend abgewiesen. Installation, Audible-Anmeldung und Downloads sind damit nicht automatisch erledigt; fehlende Apps müssen als fehlend angezeigt werden.

## Offline, Widerruf und Recovery

- Implementiert: Token und letzter validierter Snapshot liegen gemeinsam AES-256-GCM-verschlüsselt im privaten No-Backup-Speicher; der Schlüssel bleibt im Android Keystore. Kein SharedPreferences-Klartext, keine Zugangsdaten-Backups. Der Gerätecode wird nicht gespeichert. Bei Widerruf/Token-Ablauf wird die Verbindung gelöscht.
- Implementiert: Snapshot samt Empfangszeit, monotoner Gerätezeit und Boot-Zählung speichern. Ungültige Antwort/unbekannte Version verwirft die bisherige Startliste auch über Prozessneustarts hinweg; Netzwerkfehler erhält ausschließlich den letzten gültigen Stand. Geräte- und Kinderbindung werden geprüft. Keine Fehlerbehandlung gibt zusätzliche Apps frei.
- Implementiert in der Vorschau: maximal 24 Stunden App-Starts mit gültigem Cache, monoton gemessen; danach bleibt die Buddy-Ansicht ohne App-Starts. Ein Prozessneustart im selben Geräte-Boot erhält diese Frist. Nach Geräte-Neustart oder unbekanntem Boot-Zähler sind App-Starts bis zur Online-Bestätigung gesperrt. Die spätere DPC-Umsetzung muss die System-Policy schon beim Start wiederherstellen; die heutige Ansicht allein bietet keine Systemsperre.
- Ein offline befindliches Telefon kann einen serverseitigen Widerruf erst beim nächsten Kontakt erkennen. Die API kann keine sofortige Offline-Fernsperre garantieren.
- Implementiert: getrennte lokale Elternfreigabe, auch ohne Server; PBKDF2-HMAC-SHA256 mit 600.000 Iterationen und eigenem Keystore-Speicher. Einrichtung/Online-Zurücksetzen braucht eine separate, zehn Minuten gültige Eltern-Bestätigung für genau dieses Gerät. Kindertokens erhalten dadurch keine zusätzlichen Rechte. Fehlversuche und Wartezeiten bleiben über Neustarts erhalten. Wartung gilt höchstens fünf Minuten und schließt bei Hintergrundwechsel, Prozessneustart oder Rückkehr zum Kindermodus. Die Einbindung in echte Android-Sperren/deren Wiederherstellung folgt im DPC-Schritt.
- Notruf- und notwendige System-Sicherheitswege bleiben erhalten. Physisches Abschalten, Hardware-Recovery, Factory Reset über Recovery, entsperrte Bootloader und OS-Sicherheitslücken können nicht mit einer Launcher-Oberfläche vollständig verhindert werden. „Nicht schließbar“ bedeutet den geprüften verwalteten Alltagsbetrieb, keine absolute physische Manipulationssicherheit.

## Eltern-Bestätigung

`POST /api/parent/devices/:id/maintenance-code` benötigt eine echte Elternsitzung und gültigen Browser-Origin. Nur Android-Geräte derselben Familie; auch für abgelaufenen/widerrufenen Kinderzugang. Speichert ausschließlich den HMAC-Hash einer zufälligen 128-Bit-Bestätigung. Erneutes Ausstellen ersetzt alte unbenutzte Codes.

`POST /api/device/maintenance` mit `{ deviceId, code }` verbraucht diese Bestätigung atomar und liefert `{ schemaVersion: 1, deviceId, authorized: true }`. Keine Cookies und kein Kindertoken; Authorization-Header werden abgewiesen. Kein Elternlogin auf dem Handy und keine Wiederherstellung widerrufener Kinderrechte. Das ist ausschließlich die Berechtigung, lokal einen neuen Eltern-Code einzurichten. Der lokale Code/Hash wird nie übertragen. Die [Android-README](../apps/android/README.md#elternzugang-und-offline-wartung) beschreibt Bedienung und Grenzen.

## Abnahmematrix für Issue #2

Das vorgesehene Alltagsgerät ist ein **Xiaomi mit HyperOS**, das erste Entwicklungs-Testgerät ein **Xiaomi mit LineageOS**. Beide sind eigenständige Testziele. Modell, Android-Version, Patchstand, Gerätemanagementzustand sowie Bootloader-/Root-Zustand müssen erfasst werden; insbesondere ein offener Bootloader oder Root-Zugang schränkt die physische Manipulationssicherheit ein.

1. LineageOS: erster nativer Funktions- und Lock-Task-Test, mit und ohne die dort tatsächlich vorhandenen Google-Dienste; Audible-Anmeldung, Wiedergabe, Downloads und Offline-Nutzung prüfen.
2. HyperOS: vollständiger Sicherheits-Abnahmelauf am Zielgerät, einschließlich Systemleisten, Kameraverknüpfungen, Home-Zuordnung und Neustart-/Hintergrundverhalten. Ein Erfolg auf LineageOS ersetzt diesen Nachweis nicht.
3. Plattform: Android 13 als Mindestplattform und eine neuere verfügbare Version getrennt prüfen; vor Erweiterung der offiziellen Gerätezusage weitere Versionen ergänzen.

Auf dem vorgesehenen Modell mit Android-Version und Patchstand dokumentieren: Dreitasten- und Gestennavigation, Recents, Kamera per App/Power-Taste/Sperrbildschirm, Notification Shade/Quick Settings/History, Boot, Home, App-Absturz, Prozessneustart, Offline, abgelaufener Token, serverseitiger Widerruf, Entzug einer laufenden App, Deep Links aus Audible, App-Installer/Einstellungen sowie elterliche Wartung und Notrufpfad. Ein kompilierbares Projekt, Emulator oder Screenshot ersetzt diese Geräteprüfung nicht.
