# Buddy-Accessoires · Vorbereitungsstufe für #3

Eltern können unter **Kinderprofile → Ausstattung** einen kostenlosen Stern-Anstecker freigeben und anschließend anlegen oder ablegen. Freigeben und Anlegen sind getrennte Schritte. Ablegen entfernt den Besitz nicht. Es gibt noch keinen Shop, keine Käufe, keine Einlösung und keine Sterne-Abbuchungen. Android und Wandgeräte dürfen die Ausstattung nicht verändern.

## Daten und Grenzen

- Der versionierte, gebündelte Katalog steht in [`contracts/buddy-assets/manifest.json`](../contracts/buddy-assets/manifest.json). Er enthält keine Preise. Die kostenlose Freigabe akzeptiert ausschließlich `star-badge`, keine vom Client übermittelten Preise oder Haushalts-IDs.
- `children` hält das Basisprofil (Buddy-Art und Name). `buddy_ownership` hält den Besitz je Haushalt und Kind. `buddy_equipment` hält die angelegte Ausstattung je Slot. Ein zusammengesetzter Fremdschlüssel erzwingt, dass Ausstattung zum Besitz desselben Kindes und Haushalts gehört.
- `POST /api/parent/children/:id/buddy` akzeptiert `{ action: "grant" | "equip" | "unequip", accessoryId: "star-badge" }`. Er verlangt eine Elternsession und denselben Origin; Authorization-Header werden auch neben Elterncookies abgewiesen. Archivierte und fremde Profile sind ausgeschlossen. Änderungen sperren das Kinderprofil in einer Transaktion; wiederholtes Freigeben/Anlegen bleibt idempotent.
- Das Punktejournal wird nicht berührt. Käufe, Eltern-Kaufberechtigungen, transaktionale Abbuchungen und Guthaben/Lebenszeitverdienst bleiben der nächste Teil von #3.

## Gemeinsame Zeichenfläche

Web und native Android-Ansicht nutzen denselben Manifeststand und identische Basisdateien. Jedes Basisbild wird proportional in eine zentrierte **512 × 512**-Fläche eingepasst; transparente Bildränder bleiben erhalten. Anchors beziehen sich auf diese Fläche, nicht auf die sichtbare Silhouette. Der gesamte Aufbau wird anschließend proportional in den verfügbaren Platz eingepasst.

Manifestversion 1 definiert den Slot `chest`, Zeichenebene 10 (vor dem Basisbild auf Ebene 0). `x`/`y` sind die linke obere Ecke, `size` die Kantenlänge der Zubehörfläche. Der Anstecker ist ein eigenständiges Polygon auf einer 100 × 100-Fläche. Farben, Kontur und Punkte sind ebenfalls im Manifest hinterlegt. Die Basisgrafiken werden nicht verändert.

| Buddy | x | y | size |
| --- | ---: | ---: | ---: |
| Fuchs | 309 | 294 | 64 |
| Hase | 214 | 315 | 58 |
| Bär | 202 | 270 | 66 |

Weitere Slots brauchen explizite Anker je kompatiblem Buddy und eine Zeichenreihenfolge. Neue kompatibilitätsrelevante Änderungen brauchen eine neue Manifestversion. Aktuell gibt es genau einen Slot; unbekannte IDs oder fehlende Anker werden ausgelassen. Android behält bei beschädigtem/fehlendem Zubehörmanifest das Basisbild. Zubehör lädt keine externen Ressourcen; es sind keine Animationen vorhanden, auch bei reduzierter Bewegung bleibt die Darstellung statisch. Ein echtes Profilfoto ersetzt weiterhin die Buddy-Darstellung im Profilwähler; auf der Tagesansicht bleibt der Buddy sichtbar.

## Launcher-Vertrag

`GET /api/launcher/snapshot` und `?version=1` liefern unverändert Version 1 mit leeren `cosmeticIds`, damit bereits installierte Launcher weiter funktionieren. `?version=2` liefert Version 2 mit `buddy.manifestVersion: 1` und ausschließlich den angelegten Katalog-IDs des gebundenen Kindes. Besitzlisten oder Verwaltungsrechte werden nicht übertragen. Andere Versionsparameter werden abgewiesen.

Der neue Android-Client fragt Version 2 an, versteht auch Version 1 und serialisiert Version 2 verlustfrei in seinen vorhandenen verschlüsselten Offline-Cache. Unbekannte Accessoire-IDs werden beim Zeichnen ignoriert; unbekannte Vertrags-/Manifestversionen oder fehlerhafte Berechtigungen bleiben Protokollfehler. Offline wird nur die zuletzt empfangene Ausstattung dargestellt, ohne Änderungen oder Käufe. Ein Serverupdate sollte vor dem Android-Update erfolgen.

Gemeinsame Fixtures: [`launcher-v1.example.json`](../contracts/launcher-v1.example.json) und [`launcher-v2.example.json`](../contracts/launcher-v2.example.json). Die bestehenden Geräte-, Kinder-, App-Freigabe- und Offline-Grenzen bleiben bestehen.
