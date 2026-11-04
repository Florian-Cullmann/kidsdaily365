# Ort und Vorbereitung für Termine

Eltern können bei Einzelterminen und wöchentlichen Serien einen Ort (höchstens 160 Zeichen) und einen Vorbereitungshinweis (höchstens 300 Zeichen) eintragen. Beide Angaben sind optional, werden am Rand von Leerraum bereinigt und durch leere Eingaben gelöscht. Die Kinderansicht zeigt sie als Text mit Zeilenumbruch; URLs werden nicht zu Links. Es werden keine Karten oder Standortdienste verwendet.

Serien kopieren beide Angaben in jedes konkrete Vorkommen. Die Bearbeitung eines Vorkommens verändert nur dieses. Eine Wiederholung der ursprünglichen Erstellungsanfrage überschreibt keine späteren Änderungen. Haushaltsbindung, aktive Kinderprofile und Familienzeit-Auflösung verwenden dieselben Prüfungen wie andere Terminfelder.

## Migration und API-Kompatibilität

Migration `0009_adorable_meggan.sql` ergänzt `appointments.location` und `appointments.preparation` als nicht-nullbare Textfelder mit Leerstring-Default. Vorhandene Termine bleiben nutzbar. Vor dem App-Update Migrationen ausführen; kein Schema-Push.

Die internen Web-Verträge von `/api/parent/records/appointments`, `/api/parent/appointment-series`, `/api/parent/data` und der serverseitig geladenen Kinderpläne werden additiv um `location` und `preparation` erweitert. Beide Eingabefelder akzeptieren Strings; fehlende Felder werden wie leere Felder behandelt. Die bestehende vollständige Eintragsbearbeitung ist kein partielles PATCH: ältere Clients ohne die Felder leeren sie beim Speichern. Kinderausgaben enthalten immer Strings, alte Daten liefern `""`. Ungültige Typen oder zu lange Texte werden serverseitig abgelehnt.

Die versionierten Android-Launcher-Verträge V1 und V2 enthalten keine Termine und bleiben unverändert. Ihre Vertragstests laufen weiterhin. Keine Android-App-Änderung und kein Nachweis auf einem physischen Gerät.

## Abhängigkeiten

Diese Erweiterung baut auf #32 / PR #43 und #39 / PR #56 auf; diese zuerst integrieren. #29 bleibt unabhängig: dessen vollständige Terminliste muss bei der Abbildung der konkreten Termine ebenfalls `location` und `preparation` übernehmen. Die Auswahl laufender bzw. zukünftiger Termine wird hier nicht verändert.
