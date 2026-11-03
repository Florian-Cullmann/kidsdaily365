# Android-Geräteabnahme · Issue #2

Stand: 2026-11-03. Implementierung und Emulatorprüfung sind getrennt von der noch ausstehenden physischen Abnahme. Der Nutzer hat für diesen Schritt ausdrücklich nur Emulatorprüfungen vorgesehen. [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2) bleibt offen, bis die Gerätebelege vorliegen.

## Testumgebung

- Separater Android-15/API-35-Emulator, ARM64, Google-APIs-/Play-Store-Systemimage; keine echten Kinder-/Kontodaten.
- Native APK als Device Owner provisioniert; echte Android DevicePolicyManager-/Lock-Task-APIs, kein Mock-DPC.
- Instrumentation mit fiktivem Loopback-HTTP-Server. Der Backend-Vertrag wird separat mit JVM-, Web- und PostgreSQL-Integrationstests geprüft. Diese Instrumentation ist kein echter LAN-/HTTPS-/Audible-Test.
- Debug- und Release-Kompilierung/Lint sowie JVM-Tests. Web: `npm run check`, `npm run build`; Integration auf frisch migrierter temporärer `*_test`-Datenbank.

## Nachgewiesen im API-35-Emulator

- Device-Owner-Aktivierung mit lokalem Elternzugang, echter Lock Task (`LOCK_TASK_MODE_LOCKED`), Kamera- und App-Kontroll-Policies, ausschließlich Launcher plus freigegebene Test-Uhr.
- Test-Uhr tatsächlich gestartet; bei serverseitigem HTTP-401-Widerruf im Hintergrund aus der Android-Freigabeliste entfernt, Task beendet und Launcher wieder im Vordergrund.
- Abgelaufene kopierte Policy auf Launcher-only begrenzt; separate JVM-Tests prüfen Fristgrenze, Zeitrücklauf, Tokenablauf und ungültige Ansichten. Kein Echtzeit-Warten über 24 Stunden.
- Ohne Elternfreigabe kann die Verwaltung nicht abgeschaltet werden. Nach Token-Widerruf funktioniert die lokale Elternfreigabe weiter; Systemeinstellungen lassen sich bewusst öffnen. Neu erzeugter Controller ohne gespeicherte Wartungsfreigabe stellt die Einschränkungen wieder her.
- Direkter Start der Systemeinstellungen im Kindermodus wird von Android mit „App is not available“ blockiert (tatsächlicher Screenshot). Die erlaubte Test-Uhr und die ausdrücklich geöffneten Systemeinstellungen wurden visuell geprüft.
- Debugging-Sperre trennt ADB tatsächlich. Testberichte gelangen über einen lokalen Emulator-Host-Kanal zum Runner; der Produktionscode enthält keinen Debugging-Bypass.
- Kaltstart des AVD mit erhaltenen Gerätedaten und beendetem Fixture-Server: KidsDaily startet wieder im verwalteten Modus mit gesperrten App-Starts; Elternzugang und der damals vorhandene Notruf-Button blieben sichtbar. Der eigene Notruf-Button wurde mit Issue #20 für die WLAN-Kinderhandys entfernt; System-Sicherheitswege bleiben erhalten. Der Emulator wurde mit `-no-snapshot-load` gestartet, damit die Gerätedaten erhalten bleiben.
- 28 JVM-Tests, Debug-/Release-Build und Lint erfolgreich. Ein bereits bestehender `BuddyView`-DrawAllocation-Hinweis bleibt bestehen. Web: 26 Tests und Produktionsbuild erfolgreich; 27 PostgreSQL-Integrationstests auf frisch migrierter `kidsdaily_issue2_test` erfolgreich.

## Physische Abnahme: noch offen

Für jeden Lauf ausfüllen: Datum, prüfende Person, Modell, Hersteller, Android-Version, Sicherheitspatch, ROM/HyperOS-/LineageOS-Version, Bootloader-/Root-Zustand, App-Version/Commit, Signatur, Device-Owner-Zustand, Navigation (Dreitasten und Gesten getrennt), verfügbare Google-Dienste. Keine echten Kinderdaten oder Zugangscodes anhängen.

| Prüfung | Erwartung | LineageOS | HyperOS |
| --- | --- | --- | --- |
| Bewusste Provisionierung | Nur vorgesehenes Testgerät; lokale Eltern-Wiederherstellung eingerichtet, bevor Sperren aktiviert werden | offen | offen |
| Home / Recents / Gesten | Home öffnet KidsDaily; Overview und Wechsel zu nicht freigegebenen Tasks nicht möglich | offen | offen |
| Apps / Audible | Nur installierte Freigaben; fehlende Apps beschriftet; Login, Wiedergabe, Download und Offline-Nutzung funktionieren | offen | offen |
| Externe Intents / Deep Links | Aus erlaubten Apps keine Einstellungen, Installer, Browser oder anderen nicht freigegebenen Aktivitäten öffnen, auch nicht innerhalb desselben Tasks | offen | offen |
| Kamera | App, Sperrbildschirm, Power-Doppelklick und Hardware-Kurzbefehl gesperrt | offen | offen |
| Systemleisten | Notification Shade, Quick Settings, Notification History und Herstellerseiten nicht erreichbar | offen | offen |
| Power / Lautstärke / Notruf | System-Sicherheitswege erhalten; keine Flucht über Menü-Verknüpfungen; Notrufdialog erreichbar, keine echten Testanrufe | offen | offen |
| Kaltstart / Reboot | KidsDaily als Home, lokale Einschränkungen wiederhergestellt; Apps erst nach gültiger Online-Bestätigung | offen | offen |
| App-Absturz / Prozessneustart | Verwalteter Home/Service wird wiederhergestellt; keine gespeicherte offene Elternsitzung | offen | offen |
| Offline / langsamer Server | Letzte validierte Freigabe bleibt bis zum Ablauf; Netzwerkfehler öffnen keine zusätzlichen Apps | offen | offen |
| Fristablauf bei laufender App | Laufende nicht mehr zulässige App endet; nur KidsDaily plus Elternzugang und System-Sicherheitswege | offen | offen |
| Widerruf / Tokenablauf | Beim Serverkontakt bzw. lokalen Ablauf Freigaben entzogen, Kindertoken und Cache gelöscht | offen | offen |
| Entzug einer einzelnen laufenden App | Betroffener Lock Task endet; verbleibende erlaubte Apps funktionieren weiter | offen | offen |
| Installieren / Deinstallieren / Nutzerwechsel | Im Kindermodus gesperrt, keine Selbst-Deinstallation oder freie App-Kontrolle | offen | offen |
| Offline-Elternwartung | Korrekter lokaler Code öffnet Wartung auch ohne Token/Server; Fehlversuche begrenzt | offen | offen |
| Systemeinstellungen / Frist | Bewusster Elternzugang erlaubt Wartung; Rückkehr oder spätestens fünf Minuten beendet sie | offen | offen |
| Prozess-/Geräteneustart während Wartung | Einschränkungen wieder aktiv; Eltern-Code erneut nötig | offen | offen |
| Code vergessen | Gerätegebundene Online-Eltern-Bestätigung setzt ausschließlich lokalen Eltern-Code zurück | offen | offen |
| Sperren bewusst ausschalten | Nur Eltern; Einschränkungen/Home-Zwang gelöst, Verwaltung bleibt, keine automatische Datenlöschung | offen | offen |

Mindestens Android 13/API 33 und eine neuere Version prüfen. Ein Emulator auf API 35 bestätigt nicht die Mindestplattform oder Herstelleranpassungen. Freigegebene Drittanbieter-Apps einschließlich Audible müssen mit ihren tatsächlich installierten Versionen getestet werden.

## Grenzen und Quellen

Lock Task beendet laut [Android-Dokumentation](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode) Tasks, deren Pakete aus der Freigabeliste entfernt werden. Home und `BLOCK_ACTIVITY_START_IN_TASK` werden gezielt aktiviert; Overview/Benachrichtigungen nicht. Power-Menü und der System-Notrufdialog bleiben für Sicherheits-/Notrufwege verfügbar. Das Keyguard-Lock-Task-Feature erlaubt den System-Notrufweg; der tatsächliche Android-Keyguard wird auf dem dedizierten Gerät deaktiviert, damit seine Quick Settings nicht die Statusleisten-Policy umgehen. Eine bereits gesetzte Android-Bildschirmsperre verhindert die Aktivierung. Die konkrete Herstelleroberfläche ist Teil der obigen Abnahme.

Der laufende [systemExempted-Foreground-Service](https://developer.android.com/develop/background-work/services/fgs/service-types#system-exempted) ist ausschließlich für die Device-Owner-Rolle vorgesehen. [Direct Boot](https://developer.android.com/privacy-and-security/direct-boot) trennt den Aktivierungsmarker von verschlüsselten Kinder-/Elterndaten. Nach Boot wird zunächst nur der Launcher zugelassen.

Kein Versprechen gegen physisches Ausschalten, Hardware-Recovery/Factory Reset, offenen Bootloader, Root oder OS-Sicherheitslücken. Ein Offline-Gerät erkennt serverseitigen Widerruf erst beim nächsten Kontakt. Verlorene Keystore-Schlüssel lassen sich nicht offline rekonstruieren. Provisionierung, Wartung und bewusste Außerbetriebnahme: [Android-README](../apps/android/README.md#device-owner-bewusst-provisionieren).
