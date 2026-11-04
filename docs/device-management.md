# Smartphone-Verwaltung · Issue #22

Unter **Eltern → Geräte → Verwalten** gibt es eine gerätebezogene Seite mit Übersicht, Nutzung, Gerätesperre und Eltern-Kind-Chat. Bestehende Kopplungen und Launcher-Snapshots bleiben kompatibel; die neue Verwaltungsfunktion benötigt Android 0.6.0 und eine zusätzliche ausdrückliche Freigabe.

## Einrichtung

1. Datenbankmigrationen regulär anwenden, aktualisierten Server und Android-App installieren.
2. Smartphone wie bisher koppeln, lokalen Eltern-Code einrichten und den Device-Owner-Kindermodus aktivieren.
3. Auf der Verwaltungsseite einen **Verwaltungscode** erzeugen. Er gilt zehn Minuten und einmalig. Auf dem Smartphone mit dem Eltern-Code den Elternzugang öffnen und **Dashboard verbinden** wählen.
4. Im zeitlich begrenzten Wartungsmodus die Systemeinstellungen öffnen und unter dem besonderen App-Zugriff **Nutzungszugriff** für KidsDaily erlauben. Danach zum Launcher zurückkehren. Menübezeichnungen unterscheiden sich nach Hersteller.
5. Die Verwaltungsseite zeigt beim nächsten Kontakt den bestätigten Einrichtungsstand. Fehlender Nutzungszugriff wird separat angezeigt; Nachrichten und Sperren benötigen ihn nicht.

Der zusätzliche Zugang wird verschlüsselt im Android Keystore gespeichert. Nur sein Hash liegt im Server. Er berechtigt zu eigenen Nutzungsereignissen, eigenen Sperrbestätigungen und dem Gespräch des gebundenen Kindes. Der bisherige Launcher-Token bleibt ausschließlich lesend; weder dieser noch der Verwaltungszugang erlaubt Aufgabenabschluss, Punkteänderungen, Käufe oder Elternverwaltung. Neuausstellung ersetzt den alten Verwaltungszugang; Entkopplung, Ablauf und inaktives Kind sperren ihn ebenfalls.

## Sperrverhalten

Ein Auftrag besitzt eine monoton steigende Revision. Das Dashboard zeigt ihn erst nach passender Gerätebestätigung als angewendet. Offline bleibt ein Fernauftrag ausstehend. Der native Foreground-Service prüft normalerweise alle fünf Sekunden; Netzwerk-Timeouts und Android-Energiesparverhalten können die Zustellung verzögern.

Der DPC entfernt freigegebene Kinder-Apps aus Lock Task und suspendiert ihre Pakete mit `setPackagesSuspended`. Diese Android-Funktion unterbindet laut [Android Enterprise](https://developer.android.com/work/dpc/security) auch Audio und Vibration. Das ist kein allgemeiner Prozess-Kill aller Systemdienste. Launcher, Nachrichten, Eltern-Wartung und System-Notruf bleiben erhalten. Ein Plattformfehler wird gemeldet und nicht als erfolgreiche Sperre quittiert.

Der Eltern-Code öffnet wie bisher den lokalen Wartungszugang. **Gerät freigeben** hebt dort die Fernpause ohne Netzwerk auf und speichert die Freigabe für den nächsten Abgleich. Sie bezieht sich auf die zuletzt beobachtete Befehlsrevision: Eine neuere Elternentscheidung auf dem Server gewinnt gegenüber einer veralteten Offline-Freigabe. Wiederholte Synchronisation darf keinen älteren Sperrauftrag erneut anwenden. Die Freigabe hebt die normalen App-Freigaben und deren Offline-Gültigkeit nicht auf.

Angeforderte Sperre und suspendierte Pakete werden vor der Android-Durchsetzung dauerhaft gespeichert. Vor Entschlüsselung nach Boot bleibt die zuletzt angewendete Pause erhalten. Der Elternzugang ist davon unabhängig. Die bewusste vollständige Deaktivierung des Kindermodus durch Eltern hebt die Paketsuspendierung auf.

## Nutzungsdaten und Grenzen

Android `UsageStatsManager.queryEvents` liefert Bildschirm-an/-aus, Activity-Vordergrund/-Pause und Neustart-Ereignisse. Die App sendet kleine, wiederholbar bestätigte Batches mit stabilen Ereignisschlüsseln. Zeitpunkte sind UTC; Tagesgrenzen und die Dashboard-Auswertung verwenden die Familienzeitzone, einschließlich Sommerzeitwechsel.

- Bildschirmzeit zählt beobachtete interaktive Bildschirmintervalle. App-Dauer zählt beobachtete Vordergrundabschnitte; Hintergrund-Audio wird nicht als Bildschirmzeit gezählt oder als separat gemessene Audiozeit behauptet.
- Die Erfassung beginnt mit der ausdrücklichen Einrichtung. Ohne Nutzungszugriff werden keine Ereignisse gelesen. Bei Berechtigungswechseln und Neustarts werden offene Intervalle beendet; unbekannte Anfangszustände werden nicht rückwirkend erfunden.
- Offline kann die App Android-Ereignisse bis zu sieben Tage nachliefern, soweit das Betriebssystem sie noch bereitstellt. Android garantiert keine vollständige Langzeithistorie. Datenstand, Erfassungsbeginn, fehlender Zugriff und eventuelle Begrenzung der Auswertung sind sichtbar.
- Bei aktiver Nutzung wird der serverseitige Bestand auf 30 Tage Rohereignisse begrenzt. Bereinigung erfolgt bei Synchronisation oder Aufruf der Verwaltungsseite; bei vollständig inaktiven Installationen läuft kein eigener Hintergrund-Purge. Backups haben ihren eigenen Aufbewahrungszyklus.
- Pro Auswertung maximal 20.000 Ereignisse, im sichtbaren Verlauf die letzten 200 Abschnitte. Ein abgeschnittener Zeitraum wird ausdrücklich als unvollständig angezeigt.

## Nachrichten

Ein Gespräch gehört zum Haushalt und Kind, unabhängig vom gerade betrachteten Smartphone. Die Schnittstellen können später auch von einer separat authentifizierten Eltern-App genutzt werden. Textnachrichten sind auf 2.000 Zeichen begrenzt. Absender und Kindzuordnung werden serverseitig bestimmt. Stabile Request-IDs verhindern doppelte Nachrichten bei Wiederholung. Paginierung verwendet Zeitpunkt und ID, sodass zeitgleiche Nachrichten nicht übersprungen werden.

Gesendet bedeutet **auf dem Server gespeichert**, gelesen bedeutet **im geöffneten Gespräch bestätigt**; eine garantierte Push-Zustellung wird nicht behauptet. Der Launcher synchronisiert im verwalteten Modus regelmäßig. Es gibt keine externen Pushdienste, Sounds oder öffentlichen Kontakte. Das Handy behält den letzten Gesprächsausschnitt und den Entwurf verschlüsselt; ältere Nachrichten werden bei Bedarf nachgeladen. Ein fehlgeschlagener Versand bleibt zum erneuten Senden erhalten. Der Server bewahrt den Gesprächsverlauf ohne automatische Löschfrist auf; das Archivieren eines Kinderprofils löscht dessen Historie nicht. Widerruf oder eine andere Gerätebindung entfernt den lokalen Kommunikationszugang und Cache.

## Prüfung und noch ausstehende Geräteabnahme

Automatisiert: Web-Lint/Typen/Unit-Tests/Build, PostgreSQL-Integrationstests gegen eine migrierte `*_test`-Datenbank sowie Android-Unit-Tests, Debug-/Release-Build und Lint. Regressionstests prüfen Familien-/Kindergrenzen, Token-Trennung, Widerruf/Rotation, Befehlsrevisionen, doppelte Telemetrie/Nachrichten, Lesestatus und Paginierung bei identischen Zeitpunkten.

Der opt-in `DeviceManagementScenario` im Android-Test-APK ist ausschließlich für einen frisch provisionierten Wegwerf-Emulator bestimmt. Er nutzt den lokalen Fixture-Server `http://10.0.2.2:3122`, den fiktiven Gerätecode `issue22-fictional-pairing` und eine eigens erstellte Test-Elternsitzung. Diese Testzugänge sind keine Produkt-Backdoors; der normale Server akzeptiert sie nur, wenn sie ausdrücklich in seiner Testdatenbank eingerichtet wurden. Die Grunddaten erzeugt `DATABASE_URL=postgres://localhost/kidsdaily_issue22_test node scripts/seed-device-management-fixture.mjs` nach den Migrationen in einer frischen Testdatenbank. Der zugehörige Testserver verwendet `APP_MODE=live`, `APP_ORIGIN=http://127.0.0.1:3122`, `FAMILY_ID=22222222-2222-4222-8222-222222222222`, `SESSION_SECRET=issue22-only-fictional-session-secret-32chars` und einen beliebigen Test-`SETUP_CODE` mit mindestens 24 Zeichen. Der Fixture-Code verweigert Datenbanken ohne `_test`-Suffix und bereits bestehende Fixture-Haushalte. Nur den ausdrücklich dafür provisionierten Wegwerf-Emulator verwenden; die Test-App startet dessen echte Device-Owner-Sperren.

Der Test wird über den bestehenden Runner mit `-e managementServer http://10.0.2.2:3122 -e reportPort 3123` gestartet. Der Report-Empfänger erhält Screenshots und das Ergebnis, da die aktive Device-Owner-Policy ADB abschalten kann.

Nachgewiesen im Android-15/API-35-Emulator: echte Serverkopplung und Verwaltungsfreigabe, beidseitige Nachrichten, Suspendieren der laufenden Uhr-App, passende Serverbestätigung, Wiederladen der gespeicherten Pause, Chat innerhalb der Pause und lokale Eltern-Code-Freigabe samt Serverabgleich. Screenshots im PR zeigen die implementierten Oberflächen mit fiktiven Daten.

**Noch erforderlich auf einem unterstützten physischen Herstellergerät:** Audible bereits abspielen lassen (auch bei ausgeschaltetem Bildschirm), Fernsperre auslösen und Audio-Stopp prüfen; anschließend Dashboard-Freigabe, Offline-Eltern-Code, Neustart, Netzwerkverlust, Wartung und Notruf überprüfen. Emulator und Compiler sind kein Beleg für Audible oder herstellerspezifische Energiespar-/Notrufwege. Issue #22 bleibt für diese Geräteabnahme offen.

## Installationsstatus freigegebener Apps (#65)

Die Eltern-Geräteansicht zeigt pro aktiver Freigabe „Installiert · startbar“, „Installiert · keine Startaktivität“, „Installation fehlt“ oder „Status unbekannt“, mit Geräte-Prüfzeit. Nach 30 Sekunden ohne Kontakt erscheint offline; bei weiterem Kontakt ohne aktuelle App-Prüfung erscheint veraltet. Startbar bezeichnet eine vorhandene Startaktivität, keine Garantie bei Fernpause oder anderen Android-Sperren.

Sync v1 bleibt kompatibel: Der Server bietet optional `appStatusVersion: 1` und `appStatusPackages` (höchstens 200 Pakete, alphabetisch) an. Erst danach sendet der neue Launcher `appStatuses`. Alte Launcher lassen dieses Feld weg; bei alten Servern bleibt es aus. Unbekannte Erweiterungsversionen werden nicht verwendet. Mehr als 200 Freigaben bleiben außerhalb des Prüffensters unbekannt. Meldungen enthalten ausschließlich Paketname, Zustand und Prüfzeit. Keine Versionsnummern, Zugangsdaten oder Nutzungsinhalte werden hinzugefügt. Der Server filtert gegen aktive Freigaben des gebundenen Kindes; die Elternansicht blendet entfernte Freigaben sofort aus. Der nächste Sync entfernt gespeicherte, inzwischen nicht mehr freigegebene Meldungen. Die letzte Meldung bleibt offline als ausdrücklich alter Stand sichtbar.

Der verwaltete Dienst prüft im regulären Fünf-Sekunden-Abgleich neu, sodass Installation, Entfernung und Updates ohne Broadcast-Abhängigkeit beim nächsten erfolgreichen Abgleich sichtbar werden. Netzwerkfehler verzögern die Aktualisierung. Die Android-Berechtigung `QUERY_ALL_PACKAGES` ermöglicht die Unterscheidung zwischen fehlenden Paketen und installierten Paketen ohne Startaktivität: Android filtert sonst die Paketsichtbarkeit ([Android-Dokumentation](https://developer.android.com/training/package-visibility/declaring)). Der Code fragt ausschließlich die freigegebenen Paketnamen einzeln ab, ohne installierte Apps aufzuzählen. Keine APK-Installation oder neue Gerätebeschränkung wird eingeführt.

Prüfung am dedizierten Testgerät: freigegebenes Paket installieren, aktualisieren und entfernen; jeweils nach erfolgreichem Sync Status und Prüfzeit prüfen. Paket ohne Startaktivität und Offline-Zustand separat prüfen. Diese Implementierung ersetzt keine physische Geräteabnahme aus #22.
