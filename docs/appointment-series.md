# Wöchentliche Terminserien

Unter **Elternbereich → Termine → Neu anlegen** die Wiederholung **Wöchentlich als Serie** wählen. Beginn, optionales Ende des ersten Termins und das inklusive Serienende eingeben. Die Vorschau zeigt alle Termine in der Familienzeitzone, unabhängig von der Gerätezeitzone. Erst „Speichern“ legt die Serie an.

Eine Serie reicht höchstens ein Kalenderjahr und enthält maximal 53 Vorkommen. Beginn und Ende behalten ihre lokale Uhrzeit über Zeitumstellungen. Nicht existierende Uhrzeiten blockieren die gesamte Serie mit einem Datumshinweis; Beginn/Ende muss dann angepasst werden. Doppelte Uhrzeiten erfordern für jeden betroffenen Zeitpunkt die ausdrückliche Wahl des ersten oder zweiten Vorkommens. Es werden keine Termine still übersprungen.

**Bearbeiten** und **Termin absagen** betreffen ausschließlich das gewählte Vorkommen. Das Kind einer Serie bleibt gleich. Abgesagte Termine bleiben gespeichert und werden nicht automatisch neu angelegt. Eine Änderung aller folgenden Termine ist nicht vorgesehen; dafür die bisherige Serie beenden und eine neue anlegen.

**Serie beenden …** zeigt die aktiven, noch nicht begonnenen Termine. Die Bestätigung sagt genau diese ab; vergangene und laufende Termine bleiben erhalten. Ändert sich die Auswahl währenddessen durch Bearbeitung oder Zeitablauf, wird die Bestätigung abgelehnt: mit „Zurück“ schließen und die Vorschau erneut öffnen. Beendete Serien können nicht für zukünftige Termine reaktiviert werden; neue Termine separat anlegen.

## Persistenz und Integration

- `appointment_series` speichert die Serienidentität, Haushalt/Kind, ursprüngliche Zeitzone, Anfrageschlüssel samt Eingabe-Hash und gegebenenfalls den Beendigungszeitpunkt.
- Alle UTC-Vorkommen entstehen in derselben Transaktion als normale `appointments` mit Serien-ID und fester Position. Datenbank-Constraints sichern Haushalt/Kind und eindeutige Positionen. Bestehende Einzeltermine bleiben unverändert.
- Wiederholungen desselben Erstellungsrequests liefern dieselbe Serie, auch nach späteren Einzeländerungen. Eine Wiederholung mit geändertem Inhalt und gleichem Schlüssel wird abgelehnt. Nach verlorener Antwort im unveränderten Formular erneut speichern.
- Serienende und Einzelbearbeitung verwenden dieselbe Sperre. Eine Vorschauversion schützt vor unbemerktem Absagen inzwischen geänderter Vorkommen.
- Kinderansicht und die Wochenvorschau aus #33 können die vorhandenen Termine lesen; es gibt keine Expansion beim Lesen. Das laufende-Termine-Verhalten aus #29 ist separat.
- Neue Verwaltungsrouten erfordern eine Elternsitzung, Schreibzugriffe zusätzlich den konfigurierten Browser-Origin. Wand- und Android-Tokens erhalten keine Rechte.

Zeitzonenauflösung und Einzelterminformular bauen auf #32 / PR #43 auf. Kein externer Kalenderdienst und keine zusätzlichen Laufzeitabhängigkeiten.
