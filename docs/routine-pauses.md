# Routinen pausieren

Unter **Elternbereich → Routinen → Pausen verwalten** lassen sich einzelne Routinen für ein Datum oder einen Zeitraum pausieren. Kind, Routine und Familienzeitzone stehen im Kopf der Pausenverwaltung. Start- und Enddatum zählen beide dazu; für einen Tag sind sie identisch. Die optionale Notiz bleibt in der Elternansicht.

Eine neue Pause darf frühestens am aktuellen Familientag beginnen. Die normale Vorlage, Aufgabenfolge und Wochentage ändern sich nicht. Aktuelle und künftige Pausen werden aufgeführt und können einzeln aufgehoben werden. Überlappungen wirken als **Vereinigung**: Ein Tag bleibt pausiert, solange noch mindestens eine aktive Ausnahme darauf liegt. Nach dem letzten Pausentag gilt der normale Wochenplan automatisch wieder.

## Tageskopien und Verlauf

- Noch nicht angelegte Tagespläne erhalten während einer Pause ausschließlich ausgesetzte Schritte dieser Routine. Die Kopie enthält unverändert Titel, Inhalte, Reihenfolge und Punkte der Vorlage zum Zeitpunkt ihrer Erstellung.
- Bereits angelegte offene Schritte ab dem aktuellen Familientag werden ausgesetzt. Erledigte Schritte und ihre Punktejournal-Einträge werden nicht verändert. Einzelaufgaben und andere Routinen bleiben unberührt.
- Die Kinderansicht zeigt ausgesetzte Schritte mit einem Pausensymbol und „Heute Pause“. Sie sind nicht abhakbar, vergeben keine Sterne und werden separat von offenen und erledigten Schritten gezählt. Eine vollständig ausgesetzte Routine zeigt „Heute Pause“, keinen erledigten Fortschritt.
- Das Aufheben betrifft nur Schritte, deren Pausenmarkierung auf die aufgehobene Ausnahme verweist, und nur ab dem aktuellen Familientag. Eine weitere passende Ausnahme übernimmt die Markierung. Ohne weitere Ausnahme werden die Schritte wieder verfügbar, wenn Routine und Kind noch aktiv sind und der Tag weiterhin zum Wochenplan gehört.
- Manuell entfernte Schritte (`cancelledAt`) bleiben entfernt. Bestehende Tageskopien werden nicht aus einer inzwischen geänderten Vorlage rekonstruiert. Ist die Routine inzwischen archiviert oder der Wochentag entfernt, bleiben die bereits ausgesetzten Kopien auch nach Aufhebung ausgesetzt. Neue passende Tage folgen der dann gültigen Vorlage.
- Vergangene Tage behalten ihren damaligen Zustand, auch wenn die Ausnahme später aufgehoben wird. Aufgehobene Ausnahmezeilen bleiben deshalb als Herkunftsnachweis gespeichert. Die Verwaltung zeigt nur noch aktuelle/künftige, nicht aufgehobene Ausnahmen.

Die Terminberechnung verwendet ausschließlich Kalenderdaten der Familienzeitzone, keine Server- oder Browser-Tagesgrenzen. Ein bereits offener Kinderbildschirm erhält den Stand über die vorhandene Wandbildschirm-Synchronisierung (alle zehn Sekunden). Ein Abschlussversuch aus einem veralteten Plan wird serverseitig abgelehnt; diese Funktion führt keinen eigenen Synchronisationskanal ein.

## Konsistenz und Berechtigungen

Die Eltern-API ist auf Haushalt und Routine begrenzt; das Kind wird serverseitig aus der Routine bestimmt. Geräte-Bearer-Tokens werden ausdrücklich abgewiesen. Fremder Browser-Ursprung und fehlende Elternsitzung sind ebenfalls nicht zulässig.

Snapshot-Erstellung und Pausenänderungen sperren zuerst die Vorlage. Die Pause sperrt anschließend betroffene Tageszeilen in stabiler Reihenfolge und liest das Punktejournal **nach** dem Erwerb dieser Sperren. Der Abschluss sperrt dieselbe Tageszeile und prüft die Pausenmarkierung vor der Punktevergabe. So gilt bei gleichzeitigen Aktionen: Ein zuerst bestätigter Abschluss bleibt erhalten; eine zuerst angewendete Pause verhindert den Abschluss. Die bestehende eindeutige Tageskopie und Punktejournal-Constraint gelten weiterhin. Wiederholter Versand desselben Erstellauftrags erzeugt keine zweite Ausnahme; wiederholtes Aufheben verändert nichts erneut.

Migration `0009_warm_sharon_carter` ergänzt die Ausnahmen und eine getrennte Pausenreferenz an Tageskopien. Zusammengesetzte Fremdschlüssel sichern Haushalt, Kind und Routine zusätzlich auf Datenbankebene. Keine Schema-Pushes und keine Umdeutung bestehender manueller Entfernungen.

## Prüfung

Integrationstests gegen eine migrierte disposable `*_test`-Datenbank prüfen: eine Routine mit drei Schritten (erledigt, manuell entfernt, pausiert/wieder verfügbar), Pause vor der Tageskopie, gleichzeitige Materialisierung und Erledigung, unveränderte Snapshots nach Vorlagenänderung, idempotente Aufträge, Überlappungen, automatische Fortsetzung, historische Tage, archivierte Vorlagen/entfernte Wochentage, Familienmitternacht/Sommerzeit, Geschwister-/Haushaltsgrenzen und Eltern-API-Berechtigungen. Unit-Tests prüfen die getrennte Fortschrittsanzeige und verhindern Punktevergabe für pausierte Demo-Schritte.
