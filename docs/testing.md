# Gemeinsam durchtesten

## Welche Umgebung?

- **Demo:** `APP_MODE=demo` zeigt fiktive Kinder; Fortschritt verschwindet beim Neuladen. Konten und Elternverwaltung sind absichtlich deaktiviert.
- **Manueller Live-Test:** `APP_MODE=live` mit eigener PostgreSQL-Datenbank. Profile und Fortschritt bleiben bestehen. Zuerst fiktive Namen verwenden, bis Einrichtung und Backups geprüft sind.
- **Automatische Tests:** ausschließlich eine separate, wegwerfbare Datenbank mit Namen `*_test`. Der HTTP-Smoke-Test entfernt den gesamten zugehörigen Testhaushalt. Niemals die Datenbank für euren manuellen Test oder eure Familie dafür verwenden.

Die Web-/Backend-Tests und das native Grundgerüst können jetzt geprüft werden. Die tatsächliche Android-Gerätesperre ist noch nicht implementiert und kann deshalb noch nicht als Schutz auf einem Kinderhandy abgenommen werden.

## 1. Elternzugang und Profile

1. Im Live-Modus `/register` öffnen. Als erster Elternteil mit dem `SETUP_CODE` aus der privaten Serverkonfiguration registrieren. Erwartung: Anmeldung und Weiterleitung zu `/eltern`.
2. Abmelden, mit falschem Passwort versuchen, anschließend korrekt anmelden. Erwartung: Das falsche Passwort gibt keinen Zugriff; das richtige funktioniert.
3. Zwei fiktive Kinder mit unterschiedlichen Buddys anlegen. Seite neu laden. Erwartung: Beide Profile und Buddy-Namen bleiben erhalten.
4. Ein Profil bearbeiten. Erwartung: Die Änderung betrifft ausschließlich dieses Kind.
5. Unter Elternkonto einen weiteren Elternteil einladen; den Code in einem getrennten Browser unter `/register` verwenden. Erwartung: einmal verwendbar, Zugang zur gleichen Familie; der ursprüngliche Einrichtungscode registriert jetzt keinen weiteren Elternteil.
6. Passwort ändern und die vorherige Sitzung in einem anderen Browser prüfen. Erwartung: Dort wird erneut eine Anmeldung verlangt. Bei vergessenem Passwort den dokumentierten Operator-Reset verwenden, nicht direkt Datenbankwerte bearbeiten.

## 2. Plan und Wandbildschirm

Für den Test auf einem Rechner den Elternbereich im normalen Browser und den Wandbildschirm in einem **getrennten Browser oder privaten Fenster** öffnen. Beide benötigen getrennte Cookies. Im gleichen Browser beendet der Wechsel zur Kinderansicht bewusst die Elternsitzung. Ein privates Fenster verliert seine Gerätefreigabe beim Schließen; das ist kein Persistenzfehler der Aufgaben.

1. Pro Kind eine Routine mit fünf Sternen, eine Einzelaufgabe für heute, einen zukünftigen Termin und einen Wunsch anlegen. Für die Routine den heutigen Wochentag auswählen.
2. Unter Geräte einen Code für einen **Wandbildschirm** erzeugen. Im getrennten Browser `/` öffnen und den Code eingeben. Erwartung: Profilauswahl; die Kinder sehen ihre eigenen Daten.
3. Bei Kind A eine Fünf-Sterne-Aufgabe abhaken. Erwartung: Haken, positive Rückmeldung und genau fünf zusätzliche Sterne.
4. Mehrfach schnell tippen und anschließend neu laden. Erwartung: weiterhin nur eine Buchung, der Erledigt-Zustand bleibt gespeichert.
5. Zu Kind B wechseln. Erwartung: dessen Aufgaben und Sterne sind unverändert; anderer Buddy und nur eigene Termine.
6. Im Elternbereich Aufgaben oder Termine ändern, danach die Kinderansicht neu laden. Bereits erzeugte Tageskopien ändern sich durch eine Routineänderung nicht; dafür offene Einzelaufgaben bearbeiten. Abgeschlossene Aufgaben bleiben geschützt.
7. Das Test-Wandgerät im Elternbereich sperren. In dessen Browser neu laden oder einen Abschluss versuchen. Erwartung: erneute Gerätefreigabe nötig, kein weiterer unberechtigter Abschluss.
8. Einen frischen Wandcode erstellen. Erwartung: nach der Freigabe wieder Zugriff; ein bereits verbrauchter Gerätecode funktioniert nicht erneut.

Tageswechsel, Wochentage, parallele Requests und gleichzeitige Elternänderungen werden zusätzlich automatisch gegen echte PostgreSQL-Daten getestet. Die Systemzeit des Familienrechners dafür nicht verstellen.

## 3. Touch und Betrieb

Am eigentlichen 14-Zoll-Bildschirm im Querformat und mit der vorgesehenen Windows-Skalierung testen:

- Texte aus typischem Abstand lesbar; ganze Aufgabenkarten und untere Navigation gut erreichbar; kein Hover nötig.
- Lange Aufgabenliste lässt sich scrollen, ohne dass die Navigation verschwindet. Auch Hochformat bzw. kleineres Fenster prüfen.
- Vollbild aktivieren, Profile wechseln, einen bereits erledigten Tag ansehen und mit Tastatur durch die Bedienelemente navigieren.
- Während eines Tests den Server stoppen und danach wieder starten. Erwartung: keine nur lokal erfundenen Punkte; ein Wiederholungsversuch darf nicht doppelt zählen.
- Browser bzw. Windows neu starten. Erwartung: gespeicherte Aufgaben und Sterne bleiben erhalten. Ob die Gerätefreigabe bleibt, hängt zusätzlich von der Kiosk-/Cookie-Konfiguration ab.
- Datenbank sichern und zuerst in einer separaten Ersatzinstanz wiederherstellen. Anleitung in [unraid.md](unraid.md).

Wenn der Browser auf einem anderen Rechner über die Server-IP zugreift, muss `APP_ORIGIN` exakt diese Adresse inklusive Schema/Port enthalten. `localhost` bezeichnet auf dem Wandgerät dessen eigenen Rechner. Für den späteren Unraid-Test nicht die Adresse des Entwicklungsrechners übernehmen.

## 4. Android: Was jetzt prüfbar ist

Die native App unter `apps/android/` verbindet sich mit dem Backend, zeigt Buddy und Live-Sterne und öffnet konfigurierte installierte Apps. Sie bleibt eine **ungeschützte Vorschau**. Eine Installation aktiviert keine Device-Owner- oder Systemsperren.

Mit JDK 17 und Android SDK 36:

```sh
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug assembleRelease lintRelease
```

Für einen getrennten Entwicklungs-Emulator oder ein bewusst vorgesehenes Testgerät:

1. Debug-APK aus `app/build/outputs/apk/debug/` installieren und öffnen.
2. Im Eltern-Webbereich unter Geräte einen **Android**-Code für ein fiktives Kind anlegen. In der App Serveradresse und Gerätecode eingeben. Kein Elternpasswort/Registrierungscode. HTTPS verwenden; nur Debug erlaubt HTTP mit privater IP. Im Standard-Emulator: `http://10.0.2.2:3000`. Details und Grenzen: [Android-README](../apps/android/README.md).
3. Im Elternbereich für das gekoppelte Handy **Elternzugang einrichten / zurücksetzen** wählen. Den dortigen einmaligen Code in der Handy-App unter Elternzugang verwenden und einen lokalen Eltern-Code mit mindestens 12 Zeichen setzen. Kindermodus öffnen: Trennen/Systemeinstellungen müssen erneut den Eltern-Code verlangen.
4. Buddy/Name und Sterne mit dem Web vergleichen. Am Wandbildschirm eine Aufgabe erledigen: Der Handy-Sternestand soll im Vordergrund nach dem nächsten Fünf-Sekunden-Abruf steigen. Keine Abhakfunktion auf dem Handy.
5. Eine installierte, harmlose Test-App im Eltern-Backend freigeben. Sie erscheint und lässt sich öffnen. Entfernte Freigaben verschwinden nach dem nächsten Abruf. Fehlendes Audible erscheint als „nicht installiert“ und startet nicht.
6. Verbindung unterbrechen: letzter Sternestand und letzte Aktualisierung bleiben sichtbar, der Offline-Hinweis erscheint nach dem Abruf-Timeout. Die letzte Liste wird nicht erweitert. App-Prozess im selben Geräte-Boot neu starten: Cache bleibt. Nach Geräte-Neustart ist vor App-Starts eine Online-Bestätigung nötig.
7. Verbindung wiederherstellen: Buddy/Sterne/Freigaben aktualisieren sich. Gerätezugang im Backend widerrufen: Beim nächsten Kontakt zurück zur Code-Eingabe, kein alter Kinder-Cache. Erneute Kopplung braucht einen neuen Code.
8. Optional auf dem Emulator den verschlüsselten Speicher beschädigen: Die App verlangt eine neue Kopplung und zeigt keinen alten Kinderstand. Keine Zugangsdaten oder Codes in Logs/Screenshots aufnehmen.
9. Wartung offline mit lokalem Code öffnen; nach fünf Minuten, Hintergrundwechsel und Prozessneustart ist die Freigabe geschlossen. Fünf falsche Codes eingeben: Wartezeit bleibt nach Prozessneustart. Kindertoken widerrufen: Eltern-Code funktioniert weiter offline; neu koppeln und Systemeinstellungen bleiben dahinter geschützt. Bei vergessenem Code eine neue gerätegebundene Eltern-Bestätigung ausstellen und den lokalen Code online zurücksetzen. Ein alter/bereits verwendeter/für ein anderes Handy ausgestellter Code muss scheitern.

JVM-Tests prüfen zusätzlich 24-Stunden-Grenze und Uhrenrückstellung, Neustart/Boot-Wechsel, falsches Kind/Gerät, unbekannte Versionen, unzulässige Berechtigungen/Pakete, Token-Widerruf, Speicherfehler, gleichzeitige Trennung/Synchronisierung sowie reale Loopback-HTTP-Requests ohne Browsercookies oder Redirect-Folgen. Diese Tests ersetzen keine echte Geräte-Sicherheitsabnahme. Die automatischen Backend-HTTP-Tests prüfen weiterhin Live-Sterne und die getrennten Schreibrechte.

Die echten Tests für Recents, Kamera, Quick Settings, Benachrichtigungen, Autostart, Offline-Policy, erlaubte Apps und elterliche Wiederherstellung folgen in [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2). Mindestplattform Android 13; LineageOS und HyperOS getrennt abnehmen. Siehe [Android-Konzept](android.md).

## 5. Automatische Prüfungen

Der [GitHub-Workflow](https://github.com/Florian-Cullmann/kidsdaily365/actions/workflows/ci.yml) führt pro PR bzw. `main` Folgendes aus:

- Web-Lint, Typprüfung und Unit-/API-Grenztests.
- Migrationen und Integrationstests gegen PostgreSQL 18.
- Produktionsbuild, beide Docker-Targets und realen HTTP-Smoke-Test im Runtime-Container.
- Native Android-JVM-Tests, Debug-/Release-Kompilierung und Android Lint; Debug-APK als Test-Artefakt.

Lokal ohne echte Familiendaten:

```sh
npm run check
npm run build
# Nur mit einer eigens gestarteten, wegwerfbaren *_test-Datenbank:
DATABASE_URL=postgres://…/kidsdaily_test npm run db:migrate
DATABASE_URL=postgres://…/kidsdaily_test npm run test:integration
# Nur gegen einen dazu gestarteten Testserver auf Loopback:
SMOKE_ORIGIN=http://localhost:3000 npm run test:http
```

Der HTTP-Test braucht dazu die vollständige Testserver-Konfiguration (`DATABASE_URL`, `FAMILY_ID`, `SETUP_CODE`, `SESSION_SECRET`, `APP_ORIGIN`) und einen Testhaushalt ohne vorhandene Elternkonten. Er ist ein automatischer Abnahmetest, kein Befehl für eure laufende Familieninstanz.

Fehler als GitHub-Issue mit Reproduktionsschritten, Browser-/Android-Version und bereinigtem Screenshot dokumentieren. Keine Passwörter, Codes, Tokens oder echten Kinderdaten ins Issue schreiben.

## Gruppierte Routinen

- Im Elternbereich eine Morgenroutine mit drei Schritten und unterschiedlichen Sternwerten anlegen; Schritte bearbeiten und mit „Nach oben“ / „Nach unten“ sortieren. Kind und Wochentage gelten für die ganze Routine.
- Am gekoppelten Wandbildschirm zwei Schritte abhaken: Die Gruppe zeigt „2 von 3 geschafft“. Neuladen und Profilwechsel erhalten den Fortschritt; das andere Kind erhält keine Sterne.
- Dieselbe Aufgabe auf zwei Wandbildschirmen gleichzeitig abhaken: Die Sterne werden nur einmal gutgeschrieben.
- Die Vorlage umbenennen, Schritte ergänzen, entfernen oder umsortieren: Der bereits angelegte Tag bleibt unverändert; der nächste passende, noch nicht angelegte Tagesplan übernimmt die Änderungen.
- Bestehende Routinen werden bei Migration zu Gruppen mit einem Schritt. Historische Aufgabentitel, IDs und Journalbuchungen bleiben erhalten.

Screenshots mit ausschließlich fiktiven Daten: [Elterneditor](proof/routine-editor.png), [gespeicherter Gruppenfortschritt](proof/routine-progress.png).

- Routineneditor: Vorhandene Schritte starten zugeklappt mit Titel, Symbol und Sternen. Neue Schritte öffnen sich direkt; beim Öffnen eines anderen Schritts klappt der bisherige zu. Auf-/Zuklappen auch mit der Tastatur prüfen. Ein leeres Pflichtfeld in einem geschlossenen Schritt muss beim Speichern sichtbar werden und den Fokus erhalten.

## Eigene Profilbilder

1. Drei fiktive Kinder anlegen. Unter Kinderprofile → Profilbild für zwei Kinder unterschiedliche unpersönliche JPEG-/PNG-Testbilder auswählen. Vergrößerung sowie horizontalen und vertikalen Ausschnitt ändern; die Vorschau muss dem gespeicherten Bild entsprechen.
2. Speichern, neu laden und den App-Server neu starten. Auf einem gekoppelten Wandbildschirm müssen beide Bilder in der Profilauswahl erscheinen; beim dritten Kind bleibt der Buddy als Fallback.
3. Ein Bild ersetzen und entfernen. Beim Entfernen erscheint wieder der Buddy; Aufgaben, Sterne und die anderen Profile bleiben erhalten. Eine ungültige Datei darf das bisherige Bild nicht ersetzen.
4. Ohne Sitzung/Pairing darf der Bild-Endpunkt keine Bilder liefern. Wandgeräte dürfen nur lesen; Android-Bearer nur das Bild ihres gebundenen Kindes lesen, niemals hochladen oder löschen. Nach Gerätewiderruf wird auch das Bild abgewiesen. Antworten werden mit `Cache-Control: private, no-store` ausgeliefert.
5. Vollständigen PostgreSQL-Dump der separaten Testdatenbank in eine leere `*_test`-Datenbank zurückspielen. Bildversionen und SHA-256-Prüfsummen der `child_images.data`-Spalte müssen übereinstimmen. Die Unraid-Anleitung enthält den produktiven Backup-Weg.

Automatisierte Bildtests prüfen echte Dekodierung, Größenlimits, Ausschnitt, EXIF-Ausrichtung und entfernte Metadaten. Die Datenbanktests prüfen Ersetzen/Entfernen, Rechte, Profiltrennung und unabhängigen Punktestand. Keine echten Kinderfotos in Tests oder Nachweisen verwenden.
