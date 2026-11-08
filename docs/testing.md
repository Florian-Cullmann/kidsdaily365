# Gemeinsam durchtesten

## Welche Umgebung?

- **Demo:** `APP_MODE=demo` zeigt fiktive Kinder; Fortschritt verschwindet beim Neuladen. Konten und Elternverwaltung sind absichtlich deaktiviert.
- **Manueller Live-Test:** `APP_MODE=live` mit eigener PostgreSQL-Datenbank. Profile und Fortschritt bleiben bestehen. Zuerst fiktive Namen verwenden, bis Einrichtung und Backups geprüft sind.
- **Automatische Tests:** ausschließlich eine separate, wegwerfbare Datenbank mit Namen `*_test`. Der HTTP-Smoke-Test entfernt den gesamten zugehörigen Testhaushalt. Niemals die Datenbank für euren manuellen Test oder eure Familie dafür verwenden.

Die Web-/Backend-Tests und das native Grundgerüst können jetzt geprüft werden. Der Device Policy Controller ist implementiert und wird im separaten Emulator geprüft. Die physische Herstellergeräte-Abnahme steht noch aus; siehe [Abnahmematrix](android-device-acceptance.md).

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

Die native App unter `apps/android/` verbindet sich mit dem Backend, zeigt Buddy und Live-Sterne und öffnet konfigurierte installierte Apps. Ohne ausdrückliche Provisionierung und lokale Elternaktivierung bleibt sie eine **ungeschützte Vorschau**. Eine Installation allein aktiviert keine Device-Owner- oder Systemsperren.

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

Die noch offenen physischen Tests für Recents, Kamera, Quick Settings, Benachrichtigungen, Autostart, Offline-Policy, erlaubte Apps und elterliche Wiederherstellung stehen in [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2). Mindestplattform Android 13; LineageOS und HyperOS getrennt abnehmen. Siehe [Android-Konzept](android.md).

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

1. Drei fiktive Kinder anlegen. Unter Kinderprofile → Profilbild für zwei Kinder unterschiedliche unpersönliche JPEG-/PNG-Testbilder auswählen. Das Bild direkt im Rahmen mit Maus oder Finger verschieben; mit Zwei-Finger-Geste, Mausrad oder Plus/Minus zoomen. Zurücksetzen und Tastaturbedienung (Pfeiltasten, +/−) prüfen. Die Vorschau muss dem gespeicherten Bild entsprechen, auch an den Bildrändern.
2. Speichern, neu laden und den App-Server neu starten. Auf einem gekoppelten Wandbildschirm müssen beide Bilder in der Profilauswahl erscheinen; beim dritten Kind bleibt der Buddy als Fallback.
3. Ein Bild ersetzen und entfernen. Beim Entfernen erscheint wieder der Buddy; Aufgaben, Sterne und die anderen Profile bleiben erhalten. Eine ungültige Datei darf das bisherige Bild nicht ersetzen.
4. Ohne Sitzung/Pairing darf der Bild-Endpunkt keine Bilder liefern. Wandgeräte dürfen nur lesen; Android-Bearer nur das Bild ihres gebundenen Kindes lesen, niemals hochladen oder löschen. Nach Gerätewiderruf wird auch das Bild abgewiesen. Antworten werden mit `Cache-Control: private, no-store` ausgeliefert.
5. Vollständigen PostgreSQL-Dump der separaten Testdatenbank in eine leere `*_test`-Datenbank zurückspielen. Bildversionen und SHA-256-Prüfsummen der `child_images.data`-Spalte müssen übereinstimmen. Die Unraid-Anleitung enthält den produktiven Backup-Weg.

Automatisierte Bildtests prüfen echte Dekodierung, Größenlimits, Ausschnitt, EXIF-Ausrichtung und entfernte Metadaten. Die Datenbanktests prüfen Ersetzen/Entfernen, Rechte, Profiltrennung und unabhängigen Punktestand. Keine echten Kinderfotos in Tests oder Nachweisen verwenden.


## Belohnungen einlösen

Mit fiktiven Profilen am gekoppelten Wandbildschirm einen erreichbaren Wunsch öffnen und „Einlösen anfragen“ bewusst bestätigen. Die Anfrage muss ohne Abbuchung beim Kind und im Elternbereich erscheinen. Eltern bestätigen einen Wunsch und lehnen einen zweiten ab: Nur die Bestätigung reduziert das verfügbare Guthaben, die insgesamt verdienten Sterne und abgeschlossenen Aufgaben bleiben erhalten. Nach Neuladen müssen beide Entscheidungen mit Angebotspreis und Zeitpunkten sichtbar sein.

Zwischen Anfrage und Bestätigung den Preis ändern (der angefragte Preis bleibt bestehen) bzw. den Wunsch archivieren (Bestätigung muss scheitern; Ablehnung bleibt möglich). Offline darf keine Erfolgsmeldung erscheinen. Eine nach dem Speichern verlorene Antwort erneut versuchen: gleiche Anfrage-ID und nur eine persistierte Anfrage. Die Kinderansicht aktualisiert den Serverstand über den gemeinsamen Wandabgleich alle 10 Sekunden im Vordergrund.

`tests/rewards.integration.test.ts` prüft auf einer migrierten disposable `*_test`-Datenbank parallele Anfragen, alternative Wiederholungs-IDs nach einer Entscheidung, konkurrierende Ausgaben bei knappem Guthaben, gegensätzliche Elternentscheidungen, archivierte Wünsche, Preisänderungen, manipulierte Eingaben und Haushalts-/Geschwistergrenzen. Die echten Route-Handler prüfen fehlende, native und widerrufene Gerätezugänge, getrennte Elternsitzungen und falsche Origins. Browserprüfungen ergänzen dies um bewusste Bestätigung, Offline-/Antwortverlust und den sichtbaren Verlauf.
## Ersteinrichtung in der Elternübersicht (#51)

Die Checkliste wird aus den gespeicherten Haushaltsdaten abgeleitet. Es gibt keine
manuell abhakbaren Schritte und keine lokale Erledigt-Ablage. „Status aktualisieren“
lädt den Stand neu, etwa nach dem Einlösen eines Gerätecodes auf einem anderen
Bildschirm. Neuladen setzt den Einstieg ebenfalls anhand der aktuellen Daten fort.
Geräteablauf wird bei sichtbarer Übersicht alle 30 Sekunden und bei Fensterfokus
neu bewertet; ein erzeugter, noch nicht eingelöster Code zählt nicht als Gerät.

Mit fiktiven Daten prüfen:

1. Neuer Haushalt: alle drei Schritte offen; „Kind hinzufügen“ öffnet das bestehende
   Profilformular. Ohne aktives Kind ist „Routine anlegen“ noch nicht verfügbar.
2. Aktives Kind speichern: Übersicht zeigt den ersten Schritt erfüllt. „Routine
   anlegen“ öffnet das vorhandene Routineformular mit aktivem Kind als Vorauswahl.
3. Aktive Routine mit Schritten speichern: zweiter Schritt erfüllt. „Wandbildschirm
   verbinden“ öffnet die Geräteverwaltung mit Gerätetyp Wandbildschirm, auch wenn
   vorher Android ausgewählt war. Code erstellen allein erfüllt den Schritt nicht.
4. Code am Wandbildschirm einlösen, Status aktualisieren: fertiger Zustand.
   Seite neu laden: Zustand bleibt korrekt. Android und Buddy-Ausstattung sind optional.
5. Kind archivieren: Kind und zugehörige Routine zählen nicht mehr. Routine
   deaktivieren: Routine wieder offen. Wandgerät widerrufen oder ablaufen lassen:
   Geräteschritt wieder offen. Ein Android-Gerät ersetzt kein Wandgerät.
6. Gekoppelten Wandbildschirm ohne aktive Kinder öffnen: verständlicher Hinweis auf
   Kinderprofile im Elternbereich, keine Verwaltungsaktionen und keine Gerätecodes.

`tests/setup.test.ts` deckt Ableitung, Teilzustände, Archivierung, leere/deaktivierte
Routinen, falsche Kindzuordnung, Widerruf und Ablauf einschließlich Grenzzeitpunkt ab.

### Kinderfilter in der Elternverwaltung

Unter Routinen, Einzelaufgaben, Terminen und Android-Apps begrenzt „Kind auswählen“
die Liste auf ein Kind. Liste (`tab`) und Auswahl (`child`) stehen in der URL und
bleiben beim Listenwechsel, Speichern, Archivieren und Neuladen erhalten.
„Alle Kinder anzeigen“ setzt den Filter zurück. Kinderprofile und gemeinsame Wünsche
bleiben ungefiltert. Neue Einträge verwenden das ausgewählte aktive Kind; archivierte
Kinder stehen nur zur Rückschau zur Verfügung, nicht als Ziel neuer Einträge.

Mit zwei fiktiven Kindern und gleichnamigen Routinen prüfen: filtern, Liste wechseln,
Neuanlage mit Vorbelegung, tatsächliche Zuordnung beim Bearbeiten, speichern,
archivieren und neu laden. Ein leeres sowie ein archiviertes Profil auswählen.
Eine ungültige oder fremde `child`-ID muss einen erklärten Leerzustand mit Rücksetzknopf
zeigen. Auswahl und Rücksetzen auch per Tastatur prüfen.

Der Server filtert vor dem Lade-Limit. Aufgaben und Termine zeigen höchstens 1.000
Einträge; bei weiteren Treffern erscheint ein ausdrücklicher Hinweis. Es gibt noch
keine Pagination. Integrationstests erzeugen mehr als 1.000 Einträge eines anderen
Kindes und prüfen, dass das ausgewählte Kind trotzdem gefunden wird. Die Eltern-API
bleibt mit Wandcookie oder Android-Token ohne Elternsitzung gesperrt.

## Ungespeicherte Elternformulare (#41)

Kinderprofile, Routinen, Einzelaufgaben, Termine, Wünsche und App-Freigaben vergleichen
alle Eingaben mit dem geöffneten Ausgangszustand. Schritte umsortieren, hinzufügen und
entfernen zählt ebenfalls; vollständiges Zurücksetzen macht den Entwurf wieder unverändert.
Tab-Wechsel, anderer Datensatz, Neuanlage, Abbrechen, Ausstattung/Profilbild und die
Links zum Kinderbildschirm fragen vor dem Verwerfen nach. „Weiter bearbeiten“ und
Escape erhalten die Eingaben und führen zum zuletzt bearbeiteten Feld zurück.

- Unberührtes Formular verlassen: keine Rückfrage. Geänderte Routine mit mehreren
  Schritten über jede der genannten Aktionen verlassen: beide Entscheidungen testen.
- Im Dialog mit Tab/Shift+Tab navigieren; Fokus bleibt im Dialog. Enter aktiviert
  den fokussierten Knopf. Touch-Ziele sind mindestens 48 Pixel hoch.
- Während des Speicherns sind weitere Speicher-/Verwerfaktionen gesperrt.
  Validierungs-/Netzwerkfehler erhalten den Entwurf. Nach bestätigtem Schreiben ist
  er gespeichert, auch wenn das anschließende Aktualisieren der Liste fehlschlägt.
- Reload/Tab schließen: bei Änderungen nativer Browserhinweis, sofern unterstützt.
  Browser bestimmen Text und Anzeige und benötigen meist vorherige Interaktion.
  Insbesondere mobile App-Wechsel, erzwungenes Schließen und Browserabstürze können
  ohne Hinweis erfolgen. Es gibt keine automatische Speicherung oder Wiederherstellung.
- Abmeldung und erkannter Sitzungsablauf haben Vorrang und löschen den Entwurf ohne
  Rückfrage. Ein anderer Elternteil/Haushalt erhält eine neue Konsoleninstanz.

`tests/parent-drafts.test.tsx` prüft diese Abläufe mit fiktiven Daten und simuliertem
Transport; die native Dialog-Fokusfalle und der Browserhinweis brauchen zusätzlich
Browserprüfung. Das ist kein Nachweis serverseitiger Berechtigungen.

Kopierentwürfe (#34) öffnen über `leave` mit eigenem Formularschlüssel und vorbelegten
Startwerten als Vergleichsbasis. Auch „Routine kopieren“ und „Pausen verwalten“
fragen vor dem Verwerfen geänderter Eingaben nach.

## Lesende Wochenvorschau (#33)

- Unter Elternbereich → Wochenvorschau Kind und Datum wählen. Vorherige/nächste Woche und Rückkehr zur aktuellen Woche prüfen; eine Woche läuft von Montag bis Sonntag in Familienzeit.
- Eine Routine heute am Wandbildschirm materialisieren, danach ihre Vorlage ändern. Die Wochenvorschau zeigt die gespeicherten Schritte unverändert und für zukünftige, noch nicht angelegte Routinen die neue Vorlage mit „Vorschau“. Auch entfernte Schritte bleiben nachvollziehbar; fehlende historische Tage werden nicht aus heutigen Vorlagen rekonstruiert.
- Einzelaufgaben und Termine einschließlich mehrtägiger Zeiträume prüfen. Terminenden sind exklusiv: Ein Ende um Mitternacht belegt nicht den Folgetag. Alle angezeigten Terminzeiten folgen der Familienzeitzone, auch am DST-Wechsel.
- Archivierte Kinder bleiben auswählbar, erhalten aber keine berechneten Routinen. Leere Tage bleiben neutral. Auf 390 px und großem Bildschirm sowie mit Tastatur prüfen.
- Ohne Elternsitzung (auch mit Launcher-Bearer) führt die Seite zur Anmeldung. Ein Kind eines anderen Haushalts liefert keine Daten.
- `tests/week-preview.integration.test.ts` prüft unveränderte Tageskopien und leeres Punktejournal nach Vorschauabrufen gegen PostgreSQL. Die Lesetransaktion selbst ist `READ ONLY`, mit konsistentem Snapshot.
- Kompatibilität mit #28: Bis dessen additive Migration auf `main` liegt, erkennt ein lesender Adapter die vorhandene Tabelle `routine_pauses`; er verwendet ausschließlich deren inklusive Datumsbereiche, `revokedAt` und den gespeicherten `daily_tasks.pausedBy`-Verweis. Kein eigenes Pausenmodell und keine Migration in #33. Pausierte Schritte heißen „Pausiert · nicht fällig“, erledigte Schritte bleiben erledigt. Nach Integration von #28 kann der Adapter auf die gemeinsamen Drizzle-Typen umgestellt werden.
- Der zusätzliche Pausen-Integrationstest läuft, sobald die #28-Migration in der disposable Testdatenbank vorhanden ist; ohne diese Tabelle wird ausschließlich dieser Test übersprungen. Beide Datenbankstände prüfen. Die Migration aus #28 ausschließlich in einer disposable `*_test`-Datenbank separat anwenden, niemals außerhalb des normalen Migrationsablaufs auf deployed Daten.

## Tagesplan drucken (#50)

- In der Wochenvorschau bei einem Tag „Tagesplan drucken“ öffnen. Datum und Kind bleiben erhalten; der Druckknopf öffnet den Browserdruckdialog. A4 und ausgeschaltete Browser-Kopf-/Fußzeilen wählen (sonst kann der Browser die URL ergänzen).
- Kurzen und mehrseitigen Plan prüfen: Schritte mit Erklärungen, Uhrzeiten, Einzelaufgaben und mehrtägige Termine; freie Kästchen für Papier, digitale Abschlüsse ausdrücklich „Erledigt“, Pausen/entfernte Aufgaben nicht fällig. Keine Navigation, Fotos, Geräteinformationen oder Codes im Druckinhalt.
- Vorschau, archiviertes Profil, leeren zukünftigen und fehlenden vergangenen Tag prüfen. Handschriftliche Haken werden nicht synchronisiert und vergeben keine Sterne.
- Druckansicht verwendet ausschließlich `getWeekPreview` mit dessen lesender Transaktion. Bestehende Integrationstests prüfen Schreibfreiheit und Haushaltsgrenzen; `print-day.test.ts` prüft die Elternsperre der Druckroute. Ohne Elterncookie muss auch ein Launcher-Bearer zur Anmeldung führen.

## Routinen für Geschwister kopieren

Unter **Routinen → Routine kopieren** erscheint ein unabhängiger Entwurf mit Quellkind und aktivem Zielkind. Titel, Schritte (einschließlich Erklärung, Symbol und Sternen), Schrittfolge, Tagesabschnitt, Uhrzeit, Sortierung und Wochentage sind vor dem Speichern änderbar. Die Kopie startet aktiv; bei Bedarf im Entwurf deaktivieren. Abbrechen schreibt nichts.

Der angezeigte erste Wirksamkeitstag richtet sich nach dem heutigen Familientag und den gewählten Wochentagen. Neue Routinen werden beim nächsten Tagesplanabruf für einen passenden Tag übernommen, gegebenenfalls bereits heute. Speichern selbst erzeugt keine Tagesaufgaben. Bestehende Tageskopien der Quelle bleiben unverändert; Verlauf, Abschlüsse, verdiente Sterne und Pausen werden nicht kopiert. Die Pausenfunktion aus #28 ist noch separat in Arbeit.

Mit fiktiven Geschwisterprofilen eine Routine mit drei unterschiedlichen Schritten kopieren, im Entwurf Reihenfolge und Titel ändern, anschließend Quelle und Kopie getrennt bearbeiten. Auch Abbrechen und einen erneuten Speicherversuch nach verlorener Antwort prüfen: Pro Entwurf entsteht höchstens eine Kopie. Bei geändertem Inhalt nach bereits erfolgreichem Speichern wird ein Konflikt gemeldet; dann die gespeicherte Kopie bearbeiten. Automatische Integrationstests prüfen parallele Wiederholungen, unveränderte Historie, fremde Haushalte, archivierte Ziele und den Ausschluss von Gerätezugängen.

## Automatischer Abgleich am Wandbildschirm (#26)

Mit zwei getrennten Browser-Sitzungen und zwei gültigen Wandfreigaben testen; Elternverwaltung in einer dritten Sitzung öffnen. Ausschließlich fiktive Profile verwenden.

1. Dasselbe Kind auf beiden Wandbildschirmen auswählen. Auf A eine Aufgabe abschließen; B übernimmt innerhalb des nächsten Zehn-Sekunden-Abrufs Abschluss und Sterne, ohne eine eigene Erfolgsmeldung zu erzeugen.
2. Über die Elternverwaltung Profil/Buddy, Profilbild oder Termin ändern. Auswahl, geöffnete Termine-/Sterneansicht und Scrollposition des Wandbildschirms bleiben bei der Aktualisierung erhalten. Routinenänderungen schreiben bestehende Tageskopien weiterhin nicht um.
3. Verbindung auf B unterbrechen. Der letzte Stand bleibt sichtbar; Aufgaben sind gesperrt. Unten rechts steht „Sync fehlgeschlagen“. Ein Klick zeigt während des erneuten Abrufs „Versuche Sync...“, bei Erfolg „Letzter Sync: dd.mm.YYYY HH:ii“ in Familienzeit. Wieder verbinden: Abgleich ohne Neuladen, keine automatisch nachgesendeten Abschlüsse. Bei verloren gegangener Abschlussantwort entscheidet der nächste Serverabgleich über den tatsächlich gespeicherten Zustand.
4. Ausgewähltes Profil archivieren: B kehrt zur aktuellen Profilauswahl zurück. Wandfreigabe widerrufen: B entfernt die geschützten Inhalte und zeigt die Kopplung. Ein Widerruf kann erst bei erreichbarem Server erkannt werden.
5. Tageswechsel in der Familienzeitzone sowohl mit ausgewähltem Kind als auch mit offener Profilauswahl prüfen. Offline werden alte Aufgaben nicht als heutige Aufgaben angeboten; nach erfolgreichem Abruf erscheint der neue Plan. Die Geräteuhr muss richtig eingestellt sein; der Server prüft das gültige Aufgabendatum zusätzlich bei jedem Abschluss.
6. Versteckte Seite wieder öffnen oder Browser fokussieren: unmittelbarer Abgleich. Bei leerem Haushalt führt ein neu angelegtes Profil ohne Seitenreload zur Profilauswahl. Demo-Modus erzeugt keine Wand-API-Aufrufe.

`tests/wall-sync.test.ts` prüft kontrolliert verspätete/abgebrochene Antworten, parallele Abrufe, Abschlussabgleich, Timeout, Familien-Mitternacht und Widerruf. Die Integrationstests für `/api/wall/snapshot` prüfen echte Wand-/Android-/Elternberechtigungen, Haushaltsgrenzen, Ablauf, Widerruf und unveränderte Tageskopien. Die Antworten sind ausdrücklich `private, no-store`.

### Terminanzeige am Wandbildschirm

Laufende Termine bleiben bis zur exklusiven Endzeit sichtbar und tragen „Jetzt“.
Ohne Endzeit bleibt ein Termin bis zum Ende seines Starttags in der Familienzeitzone
sichtbar (nach Beginn „Heute“, keine behauptete laufende Dauer). Die Terminliste
enthält alle relevanten aktiven Termine des Kindes und lässt sich bei Bedarf scrollen.
Die Ansicht prüft Zeitgrenzen alle 15 Sekunden und bei Rückkehr zum Browser;
Änderungen durch andere Geräte übernimmt der automatische Abgleich (siehe #26 oben).
Prüfe mehr als drei Termine, einen laufenden Termin über Mitternacht, einen Termin
ohne Ende sowie das automatische Verschwinden nach Ablauf. Sommerzeit und
Profil-/Haushaltsgrenzen werden zusätzlich durch die automatischen Tests abgedeckt.
