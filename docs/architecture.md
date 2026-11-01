# Architektur

## Drei Oberflächen, getrennte Rechte

| Client | Aufgabe | Berechtigung |
| --- | --- | --- |
| Eltern-Webbereich `/eltern` | Familie, Profile, Pläne, App-Freigaben und Geräte verwalten | Persönliches Elternkonto; serverseitige Sitzung |
| Wandbildschirm `/` | Profilauswahl, persönlicher Tagesplan, Aufgaben abhaken | Individuell freigegebenes Wandgerät; Gerätecookie |
| Native Android-App | Eigener Buddy, eigene Sterne, erlaubte Apps | Ein Kind je Gerät; ausschließlich lesender Bearer-Token |

Ein Haushalt pro Installation, konfiguriert durch die stabile `FAMILY_ID`. Das Datenmodell bewahrt Familiengrenzen; Registrierung bietet keine öffentliche Auswahl oder frei übermittelbare Familien-ID. Familien- und Kinderzuordnung kommen aus der serverseitig geprüften Identität, nicht aus frei gewählten Clientparametern.

Next.js/TypeScript verbindet UI und HTTP-API, PostgreSQL speichert den Zustand und Drizzle versioniert das Schema. Fachliche Dienste und Datenbankzugriff liegen unter `src/server/`; validierte Eingabeverträge unter `src/domain/`. Android ist ein eigenständiges natives Projekt. Es gibt keine Microservices, externen Identity-Anbieter oder Cloud-Abhängigkeit. Die Auslieferung nutzt den [Next.js-Standalone-Build](https://nextjs.org/docs/app/guides/self-hosting).

## Eltern und erste Einrichtung

Der erste Elternzugang benötigt den bei der Installation gesetzten `SETUP_CODE`. Die erste Registrierung legt den konfigurierten Haushalt bei Bedarf automatisch an. Eine PostgreSQL-Transaktionssperre serialisiert die erste Besitzübernahme; danach ist derselbe Einrichtungscode keine weitere Registrierungsberechtigung. Weitere Eltern brauchen eine vom bestehenden Elternteil erzeugte, einmalige Einladung mit 48 Stunden Gültigkeit. Alle Eltern dieser Installation sind gleichberechtigte Haushaltsadministratoren.

Passwörter werden mit Nodes eingebautem scrypt, individuellem Salt und `N=2^17, r=8, p=1` gespeichert. Die Implementierung begrenzt gleichzeitige Hashvorgänge, Eingabelängen und Anmeldeversuche. Ein unbekanntes Konto verursacht ebenfalls den Hashaufwand; die Login-Fehlermeldung verrät nicht, ob eine E-Mail registriert ist. Diese Parameter folgen der [OWASP-Empfehlung für scrypt](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Zufällige Sitzungstokens werden nur gehasht in der Datenbank gespeichert (HMAC-SHA256 mit `SESSION_SECRET`). Das Elterncookie ist HttpOnly, SameSite=Strict, bei HTTPS Secure und zwölf Stunden gültig. Logout löscht die Sitzung. Passwortwechsel beendet alle alten Sitzungen dieses Kontos und gibt auf dem aktuellen Gerät eine neue aus. Operator-Recovery über `npm run auth:reset` widerruft sämtliche Sitzungen des betroffenen Kontos. Rotation von `SESSION_SECRET` widerruft zusätzlich sämtliche Geräte-, Einladungs- und Pairing-Tokens; Passwörter bleiben gültig.

Beim Betreten des gemeinsamen Kinderbildschirms mit einer noch aktiven Elternsitzung erscheint zunächst die Abmeldeansicht. Erst nach erfolgreichem Logout und Neuladen wird die Kinderansicht zugänglich. Das separate Gerätecookie bleibt erhalten. Eltern sollten ihren eigenen Zugang auf dem persönlichen Gerät nutzen; Profilauswahl unter Geschwistern ist bewusst keine zusätzliche Anmeldung.

## Geräte und Schreibgrenzen

Eltern erzeugen einen zehn Minuten gültigen, zufälligen Gerätecode für `wall` oder `android`. Android-Codes müssen genau einem aktiven Kind zugeordnet sein; Wandgeräte haben keine einzelne Kinderzuordnung. Der Gerätetyp wird aus dem gespeicherten Code abgeleitet. Ein Client kann durch einen anderen angefragten Typ keine zusätzlichen Rechte erlangen. Ein Code wird unter einer Zeilensperre genau einmal verbraucht.

Wandgeräte bekommen ausschließlich ein HttpOnly-Cookie, Android-Geräte ausschließlich einen Bearer-Token. Beide werden serverseitig als einzelne Geräte mit 90 Tagen Laufzeit geführt und können widerrufen werden. Archivierung eines Kindes widerruft seine Android-Geräte. Jede Geräteprüfung kontrolliert Ablauf, Widerruf, konfigurierten Haushalt und gegebenenfalls das aktive Kinderprofil. Eine Erweiterung von Leserechten zu Verwaltungs- oder Abhakrechten findet niemals statt.

Browser-Schreibzugriffe brauchen den exakt zu `APP_ORIGIN` passenden Origin-Header. Native Pairing-Requests dürfen den Header weglassen, erhalten dadurch aber nur die Rechte ihres Android-Codes. Native Tokens werden am Aufgabenabschluss ausdrücklich abgewiesen. Elternrouten verwenden ausschließlich die Elternsitzung; Gerätecookies und Bearer-Tokens sind dort wirkungslos. Der Launcher-Snapshot enthält keine Aufgaben oder Geschwisterdaten. Es gibt keinen Kauf- oder Punkteänderungs-Endpunkt für Handys.

## Datenmodell

| Tabellen | Verantwortung |
| --- | --- |
| `families`, `parents` | Haushalt, Zeitzone, persönliche Elternkonten |
| `parent_sessions`, `parent_invitations` | Ablaufende, widerrufbare Sitzungen und einmalige Einladungen |
| `children` | Name, Avatar, Buddy-Typ/-Name, Bewegungspräferenz, aktiv/archiviert |
| `task_templates` | Routinen je Kind, Wochentage, Uhrzeit, Abschnitt, Reihenfolge, Punkte |
| `daily_tasks` | Datierte Aufgabenkopien und Einzelaufgaben, gegebenenfalls storniert |
| `point_entries` | Einmalige positive Punktebuchung pro abgeschlossener Aufgabe |
| `appointments`, `rewards` | Eigene Termine je Kind; gemeinsame Wunschziele mit individuellem Fortschritt |
| `allowed_apps` | Exakte aktive Android-Paketnamen und Anzeigenamen je Kind |
| `devices`, `device_pairing_codes` | Gerätekind, Kindzuordnung, Hashes, Ablauf, Widerruf bzw. Verbrauch |

Zusammengesetzte Fremdschlüssel sichern Kind-/Familienzuordnungen in Aufgaben, Vorlagen, Terminen, Punkten, Freigaben und Geräten. API-Schemas sind strikt und nehmen keine frei gelieferten Familien- oder Berechtigungsfelder an. Archivierung statt Löschung erhält Kinder- und Aufgabenhistorie. Eltern-DTOs enthalten keine Passwort- oder Tokenhashes.

## Tagesplan und Punkte

Das Tagesdatum stammt aus der IANA-Zeitzone der Familie. Termine werden als UTC-Zeitpunkte (`timestamptz`) gespeichert. Die Elternformulare lesen lokale Datum-/Uhrzeiteingaben in der Zeitzone des Eingabegeräts und erklären diese Wahl; die Kinderansicht zeigt sie in der Familienzeitzone.

Beim ersten Laden entstehen Aufgabenkopien aktiver Routinen für den jeweiligen Wochentag und aktive Kinder. `(template_id, date)` ist eindeutig. Vorlagenänderungen verändern keine bereits erzeugte Tageskopie; dafür können Eltern eine offene Einzelaufgabe bearbeiten. Ausgelassene Tage erzeugen keine nachträglichen Aufgaben oder Minuspunkte. Ferien- und komplexe Wiederholungsregeln sind noch nicht vorhanden.

Beim Abhaken prüft der Server Wandgerät, Familienzugehörigkeit, aktives Kinderprofil und aktuelles Familiendatum. Der Punktewert kommt aus der gespeicherten Aufgabenkopie. Ein eindeutiger Journalschlüssel auf `task_id` verhindert doppelte Punkte. Abschluss und elterliche Aufgabenänderung sperren dieselbe Aufgabenzeile; nach einer Punktebuchung kann die Aufgabe nicht mehr geändert oder storniert werden. Wiederholte Abschlüsse sind wirkungslos. [Drizzle-Transaktionen](https://orm.drizzle.team/docs/transactions) und Datenbankconstraints sichern diese Abläufe gemeinsam.

Der Kontostand ist momentan die Summe verdienter Sterne. Einlösung, Korrektur und Kosmetikkäufe brauchen später ein erweitertes Journal mit Gegenbuchungen und eigener Berechtigung; sie sind noch nicht vorhanden. Das Journal ist auf Anwendungsebene append-only, nicht durch getrennte SQL-Rollen gegen einen Datenbankadministrator geschützt.

## API-Übersicht

| Bereich | Schnittstellen |
| --- | --- |
| Elternauthentifizierung | `POST /api/auth/register`, `/login`, `/logout`, `/password` |
| Elternverwaltung | `GET /api/parent/data`; `POST /api/parent/records/:resource`; `PUT/DELETE /api/parent/records/:resource/:id` |
| Einladungen/Geräte | `POST /api/parent/invitations`, `/pairing-codes`; `DELETE /api/parent/devices/:id` |
| Gerätefreigabe | `POST /api/device/pair` |
| Wandbildschirm | `POST /api/tasks/:taskId/complete` |
| Android, nur lesen | `GET /api/launcher/snapshot` |
| Betrieb | `GET /api/health`, Konfiguration/DB-Schema erreichbar, keine Familiendaten |

Ressourcen der Elternverwaltung: `children`, `routines`, `tasks`, `appointments`, `rewards`, `apps`. PUT ersetzt die bearbeitbaren Felder eines Eintrags, DELETE archiviert/storniert. Abgeschlossene Aufgaben bleiben unveränderlich. Derzeit werden maximal 1000 aktuelle/zukünftige Aufgaben bzw. Termine je Verwaltungsabruf geliefert; eine umfangreiche Historien-/Suchansicht ist ein späterer Ausbau.

## Kinder-UX und Betrieb

Die Waldwelt, persönliche Tier-Buddys, große Symbole und untere Navigation orientieren sich an der bereitgestellten Referenz. Aufgabenkarten sind mindestens 80 Pixel hoch, Navigationsflächen mindestens 62 Pixel. Lange Pläne scrollen im Querformat im eigenen Bereich; im Hochformat fließt die Ansicht untereinander. Rückmeldungen kommen im Live-Modus erst nach erfolgreicher Speicherung. Bei Fehlern bleibt ein erneuter Versuch möglich. Es gibt keine automatische Bewegung, Sounds, Ranglisten oder Streak-Strafen.

Die Demo ist ausdrücklich ungespeichert und kann keine Konten anlegen oder Verwaltungs-/Gerätezugriffe ausführen. Der Server betreibt eine einzelne Haushaltsinstanz; die prozessweiten Rate Limits sind keine verteilte Internet-Abwehr. Für Fernzugriff braucht es HTTPS/VPN. Es gibt noch keinen E-Mail-Versand, keine E-Mail-Verifikation, keine MFA, keine Offline-Schreibsynchronisation und keinen Push. Beim Android-Client ist Fünf-Sekunden-Polling vorgesehen; die echte Durchsetzung von Gerätesperren folgt getrennt gemäß [Android-Konzept](android.md).
