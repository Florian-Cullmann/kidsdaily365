# Architekturentscheidungen

## Ziel und erster Zuschnitt

Ein Haushalt, ein Unraid-Server, ein gemeinsam genutzter Windows-Touchscreen. Die App startet immer in einer Profilauswahl. Das ausgewählte Kind bekommt eigene Aufgaben, Termine, Sterne und einen benannten Buddy. Gleichbleibende Bereiche und kurze Handlungsschritte geben Orientierung. Die bereitgestellte Bildreferenz bestimmt die Richtung: große Karten, freundliche Pastellfarben, deutliche Erledigt-Zustände und ein Begleiter neben dem Plan. Illustrationen und Animationen sind spätere, austauschbare Assets.

Next.js mit TypeScript verbindet die Website und eine kleine HTTP-API. PostgreSQL speichert den fachlichen Zustand; Drizzle hält Schema und Migrationen im Repository. Wir starten ohne Microservices, externen Identity-Anbieter oder separaten Worker. [Next.js unterstützt Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting); die Docker-Auslieferung nutzt den Standalone-Build. [Drizzle-Transaktionen](https://orm.drizzle.team/docs/transactions) und Datenbankconstraints sichern die Punktevergabe ab.

## Datenmodell

| Tabelle | Verantwortung |
| --- | --- |
| `families` | Haushaltsgrenze, Name und IANA-Zeitzone |
| `children` | Eigenes Profil, Avatar, Buddy-Typ/-Name, Einstellung für reduzierte Bewegung |
| `task_templates` | Aktive tägliche Routinen pro Kind, Beschreibung, Tagesabschnitt, Uhrzeit, Punkte, Reihenfolge |
| `daily_tasks` | Einmalige Tageskopie einer Routine oder eigenständige Aufgabe mit Datum |
| `point_entries` | Verdiente Punkte; genau ein unveränderter Buchungseintrag pro erledigter Aufgabe |
| `appointments` | Eigene Termine pro Kind mit UTC-Zeitpunkten und optionalem Ende |
| `rewards` | Vom Haushalt vorgegebene positive Wunschziele; Fortschritt ergibt sich aus dem persönlichen Kontostand |

Zusammengesetzte Fremdschlüssel verhindern, dass Aufgaben, Vorlagen, Termine oder Punkte versehentlich einem Kind eines anderen Haushalts zugeordnet werden. Alle Dienste erhalten die serverseitig konfigurierte `FAMILY_ID`. Die Installation bedient genau diese Familie; es gibt keine öffentliche Registrierung.

Tageskopien entstehen idempotent beim ersten Laden an einem Tag. `(template_id, date)` ist eindeutig. Änderungen an einer Vorlage ändern keine bestehende Tageskopie und keine bereits verdienten Punkte. Vorlagen gelten momentan **jeden Tag**; Wochentage, Schulferien und flexible Wiederholungen sind noch nicht implementiert. Beim Überspringen eines Tages entstehen keine nachträglichen Aufgaben und keine Minuspunkte.

## Punkte und Abschluss

Der Client übermittelt ausschließlich die Aufgaben-ID. Der Server prüft Familienzugehörigkeit und aktuelles Familiendatum, liest den Punktewert aus der Tageskopie und schreibt in einer Transaktion einen Journaleintrag. Ein eindeutiger Schlüssel auf `task_id` verhindert doppelte Punkte auch bei parallelen Requests oder einem erneuten Versuch nach einem Verbindungsabbruch. `ON CONFLICT DO NOTHING` macht Wiederholungen erfolgreich und wirkungslos. Erledigt-Zustand und Kontostand werden aus demselben Journal abgeleitet.

Das Journal ist auf Anwendungsebene append-only; die Laufzeit-DB-Rolle hat aktuell keine gesonderten SQL-Rechte zur Verhinderung manueller Änderungen. Elternkorrekturen und Einlösungen brauchen später explizite Gegenbuchungen und eine Audit-Spur. Heute gibt es weder Lösch- noch Änderungs-Endpunkte für Punkte.

## Gerätefreigabe und API

| Endpunkt | Verhalten |
| --- | --- |
| `GET /` | Demo oder Gerätefreigabe; erst nach Freigabe Daten der konfigurierten Familie |
| `POST /api/device/pair` | Gerätecode gegen Serverkonfiguration prüfen; signiertes HttpOnly-Cookie für 30 Tage |
| `POST /api/tasks/:taskId/complete` | Gerät und Origin prüfen; Aufgabe abschließen; aktuellen persönlichen Plan zurückgeben |
| `GET /api/health` | Konfiguration, DB-Verbindung und Existenz der Familientabelle prüfen; keine Familiendaten ausgeben |

Das Cookie ist an die Familie gebunden, `SameSite=Strict` und bei HTTPS `Secure`. Schreibzugriffe verlangen ein exakt zu `APP_ORIGIN` passendes Origin-Headerfeld. Der Pairing-Code hat mindestens 24, das Signatursecret mindestens 32 Zeichen. Der Pairing-Endpunkt begrenzt den Request-Body und erlaubt pro App-Prozess maximal zehn Versuche pro Minute. Das ist eine Basis für eine einzelne LAN-Instanz, kein verteilter Schutz für einen Internetdienst. Rotation von `SESSION_SECRET` widerruft alle Geräte. Die Profilauswahl ist keine zusätzliche Sicherheitsgrenze innerhalb eines freigegebenen Familienbildschirms.

Es gibt noch keinen Elternzugang. Elternfunktionen müssen später eine getrennte Berechtigung bekommen; das Gerätecookie allein darf dafür nicht reichen. Aktuell besitzt der Bildschirm ausschließlich Anzeige- und Abschlussfunktionen.

## Datum, Touch und Rückmeldungen

- Tagesdatum aus der IANA-Zeitzone der Familie, nicht aus Browser- oder Server-Lokalzeit. Termine sind `timestamptz`, angezeigt in der Familienzeitzone.
- Ein Tageswechsel wird spätestens bei der Minutenprüfung bzw. beim Aufwachen des Tabs erkannt. Veraltete Aufgaben weist der Server zurück; bereits abgeschlossene Tage bleiben bestehen.
- Große Profilkacheln und Aufgabenkarten, mindestens 48 Pixel hohe primäre Bedienelemente, keine Hover-Abhängigkeiten, Tastaturfokus und Statusmeldungen für Screenreader.
- Kein sofortiges optimistisches Abhaken im Live-Modus: Die Rückmeldung kommt nach Speicherung. Bei Fehler bleibt die Aufgabe offen und erneut anklickbar.
- Bewegungsarme Grundeinstellung pro Kind, zusätzlich `prefers-reduced-motion`. Keine automatisch gestarteten Geräusche, Zeitdruck oder Verlust von bereits verdienten Sternen.
- Noch keine therapeutische Aussage oder allgemeingültige UX für alle neurodivergenten Kinder. Als nächstes gemeinsam mit den konkreten Kindern testen und Dichte, Text, Symbole und Reize individuell anpassen.

## Ausbau in kleinen Schritten

1. Elternbereich mit eigener Anmeldung: Kinder, Buddy und sensorische Einstellungen bearbeiten; Routinen, Einzelaufgaben und Termine verwalten.
2. Wochentags-/Ferienregeln und kleinschrittige Checklisten; freie Reihenfolge, freiwillige Fokussicht und Pausen.
3. Belohnungswünsche je Kind, elterlich bestätigte Einlösung mit transaktionssicherer Abbuchung und Verlauf.
4. Buddy-Illustrationen und optionales positives Feedback. Jede Animation und jeder Ton individuell abschaltbar.
5. Sanfter Abgleich mehrerer Bildschirme (zunächst Polling). Offline-Lesen und spätere Sync-Strategie ausdrücklich planen, bevor Offline-Schreiben eingeführt wird.
6. Erst nach echtem Kiosk-Test über einen Windows-Rahmen (z. B. Tauri) entscheiden. Die Website bleibt die fachliche Basis.
