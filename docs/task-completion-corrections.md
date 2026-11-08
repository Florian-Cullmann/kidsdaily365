# Entwurf: Aufgabenabschlüsse korrigieren (#52)

Status: Vorschlag zur Abstimmung vor der Implementierung, keine verfügbare Funktion.
Dieser Entwurf schließt [#52](https://github.com/Florian-Cullmann/kidsdaily365/issues/52) nicht.

## Voraussetzungen und Reihenfolge

Die Korrektur baut auf dem gemeinsamen Journal für
[Belohnungseinlösungen #27](https://github.com/Florian-Cullmann/kidsdaily365/issues/27)
und [Buddy-Käufe #3](https://github.com/Florian-Cullmann/kidsdaily365/issues/3)
sowie dem [Tagesverlauf #30](https://github.com/Florian-Cullmann/kidsdaily365/issues/30)
auf. Der Tagesverlauf liegt in [PR #36](https://github.com/Florian-Cullmann/kidsdaily365/pull/36).
Stand 4. November 2026 sind diese Voraussetzungen nicht in `main` integriert.
Das Journal auf `main` enthält ausschließlich positive Aufgabenbuchungen einschließlich
Null-Sterne-Abschlüssen; ein zweites Journal nur für Korrekturen wäre die falsche Basis.

Zuerst den gemeinsamen Vertrag für Buchungstypen, Guthaben und Sperrreihenfolge
mit #27/#3 festlegen und die benötigte Journalbasis integrieren. Anschließend
#52 auf den integrierten Tagesverlauf aufsetzen. Der gesamte Buddy-Shop muss dafür
nicht fertig sein; seine späteren Ausgaben müssen denselben Vertrag verwenden.
Konkrete Spaltennamen und Migrationen folgen dem dann integrierten Schema.

## Fachliche Entscheidung zur erneuten Erledigung

Eine korrigierte Tageskopie wird **nicht erneut abschließbar**. Der ursprüngliche
Abschluss und seine Punktebuchung bleiben unverändert. Eine zusätzliche Korrektur
markiert die Kopie als „Abschluss korrigiert“; sie ist weder offen noch regulär erledigt.
Das gilt auch für den aktuellen Familientag. Wiederholte Abschlussrequests dürfen
weder die Korrektur aufheben noch weitere Sterne vergeben.

Die nächste reguläre Tageskopie ist unabhängig davon abschließbar. #52 erzeugt
keine Ersatzaufgabe und bietet keinen Weg, dieselbe Tageskopie erneut zu vergüten.
Bereits abgeschlossene Aufgaben bleiben für Vorlagenänderungen, Bearbeitung und
Stornierung gesperrt. Auch eine spätere Vorlagenänderung ändert keinen Korrekturbetrag.

## Journal und Nachvollziehbarkeit

Eine Korrektur referenziert genau die ursprüngliche Abschlussbuchung und deren
Tageskopie, Kind und Haushalt. Gespeichert werden eine unveränderliche Begründung,
die authentifizierte Elternidentität und ein serverseitiger UTC-Zeitstempel.
Die Elternidentität bleibt über einen nicht kaskadierend löschbaren Verweis erhalten.
Zusammengesetzte Fremdschlüssel sichern die Haushalts- und Kinderzuordnung.

Der Betrag ist immer das Negative der ursprünglichen Buchung, niemals ein
Clientwert oder der heutige Vorlagenwert. Der gemeinsame Buchungstyp „Korrektur“
muss auch den Wert null zulassen: Ein irrtümlicher Null-Sterne-Abschluss benötigt
ebenfalls einen nachvollziehbaren Korrektureintrag.

Eine Datenbank-Unique-Constraint auf der ursprünglichen Buchung verhindert mehr
als eine wirksame Korrektur. Ein eindeutiger Journalschlüssel, beispielsweise
`task-correction:<original-entry-id>`, trennt sie von Aufgabenvergütungen und
Ausgaben. Ursprünglicher Eintrag, Gegenbuchung und Auditdaten werden nicht gelöscht
oder nachträglich überschrieben. Falls Auditdaten in einer separaten Tabelle
liegen, werden sie in derselben Transaktion wie die Gegenbuchung geschrieben.

Ein wiederholter Request nach verlorener Antwort liefert die vorhandene Korrektur
zurück. Eine abweichende Begründung ersetzt deren ursprüngliche Begründung nicht.
Die Antwort und die Oberfläche zeigen die tatsächlich gespeicherten Daten.

## Guthaben, Verdienst und bereits eingelöste Sterne

- Verfügbares Guthaben = ursprüngliche Vergütungen − Korrekturen − bestätigte Ausgaben.
- Gültiger Gesamtverdienst = ursprüngliche Vergütungen − Korrekturen. Käufe senken ihn nicht.
- Bereits ausgegebene Sterne = bestätigte Ausgaben. Korrekturen zählen nicht als Käufe.
- Im Verlauf bleiben ursprünglicher Verdienst und Korrektur separat sichtbar.

Die Korrektur wird nur vollständig gebucht, wenn das aktuelle Guthaben den
gesamten Korrekturbetrag deckt. Andernfalls erfolgt ein Konflikt ohne Mutation,
mit einer verständlichen Erklärung über die fehlenden Sterne. Es gibt keine
Teilkorrektur, verdeckte Schuld, automatische spätere Abbuchung oder Rücknahme
bestätigter Käufe. Nach späterem Sterneverdienst können Eltern bewusst erneut
korrigieren. Offene Einlösungsanfragen reservieren für diesen Vertrag kein Guthaben;
ihre Bestätigung prüft den dann aktuellen Stand erneut.

Beispiel: 10 ursprünglich verdiente Sterne, davon 8 eingelöst, ergeben 2 verfügbare
Sterne. Eine Korrektur über 5 Sterne wird abgelehnt. Nach weiteren 3 verdienten
Sternen kann sie erfolgen: Gesamtverdienst 8, Ausgaben 8, Guthaben 0. Der alte Kauf
bleibt bestätigt, beide ursprünglichen Vergütungen bleiben im Verlauf sichtbar.

## Transaktion und Berechtigungen

1. Gültige Elternsitzung und Browser-Origin prüfen; Bearer-Zugriffe auch zusammen
   mit einem Elterncookie ablehnen. Wandgeräte, Launcher und Buddy-Einrichtung
   erhalten keine Korrekturberechtigung.
2. Striktes, begrenztes Eingabeschema: Abschluss-ID, getrimmte Begründung mit
   1–1000 Zeichen und ausdrückliche Bestätigung. Keine Beträge, Eltern- oder
   Haushalts-IDs aus dem Request übernehmen.
3. Abschluss ausschließlich im authentifizierten Haushalt auflösen. In der
   Transaktion zuerst die gemeinsame Guthabensperre des Kindes nehmen, danach
   gegebenenfalls die Tageskopie sperren und Abschluss/Zuordnung erneut prüfen.
4. Vorhandene Korrektur prüfen und idempotent zurückgeben. Andernfalls Guthaben
   unter derselben Sperre lesen und die vollständige Gegenbuchung samt Audit anlegen.
5. Erst nach Commit Erfolg anzeigen; bei Netzwerkfehlern keine lokale Korrektur
   annehmen. Sicherer Wiederholungsversuch bleibt möglich.

Belohnungsbestätigungen, Buddy-Käufe und Korrekturen müssen dieselbe Kindersperre
vor der Guthabenprüfung verwenden. Alle Pfade, die Kind und Aufgabe sperren,
benötigen dieselbe Reihenfolge **Kind vor Aufgabe**. Der bestehende Abschlussdienst
sperrt derzeit erst die Aufgabe und danach das Kind; diese Reihenfolge muss vor
Integration geprüft und angepasst werden, damit kein gegenseitiges Warten entsteht.
Ein Unique-Konflikt darf keinen zweiten Abzug oder halben Auditdatensatz hinterlassen.

Vergangene und aktuelle gespeicherte Tageskopien sind korrigierbar; der Lese- oder
Korrekturpfad erzeugt keine fehlenden Tageskopien. Archivierte Kinder bleiben im
Elternverlauf prüf- und korrigierbar, ohne dadurch wieder Geräteaktionen zu erlauben.
Die gemeinsame Guthabensperre muss daher Haushaltszugehörigkeit von der je Aktion
erforderlichen Aktivitätsprüfung trennen. Tageszuordnung und Anzeigezeiten folgen
der Familienzeitzone, nie dem Serverdatum.

## Eltern- und Kinderansicht

Im Tagesverlauf aus #30 steht bei einem noch nicht korrigierten Abschluss die
Aktion „Abschluss korrigieren“. Der Bestätigungsdialog nennt Kind, Aufgabentitel,
Familientag, ursprünglichen Abschlusszeitpunkt, abzuziehende Sterne und die
Folge „Diese Aufgabe wird nicht wieder geöffnet“. Begründung und ausdrückliche
Bestätigung sind erforderlich; ein einzelnes Antippen führt keine Buchung aus.

Danach zeigt der Verlauf sowohl „Abgeschlossen: +N Sterne“ als auch
„Durch Eltern korrigiert: −N Sterne“, mit Elternidentität, Zeitpunkt und Begründung.
Bei null Sternen wird „0 Sterne“ angezeigt. Die Kinderansicht zeigt den neutralen
Status „Abschluss korrigiert“ und das aktualisierte Guthaben, ohne Korrekturaktion
oder private Elternbegründung. Fortschritt und Erledigt-Zähler zählen korrigierte
Aufgaben nicht als regulär erledigt; sie bleiben ohne offenen Abschlussbutton sichtbar.

## Umsetzung und Nachweis

Die Implementierung benötigt eine versionierte Migration des gemeinsamen Journals,
einen Elternendpunkt, einen transaktionalen Serverdienst sowie Anpassungen an
Tagesverlauf, Tagesplan, Guthaben- und Verdienstabfragen. Joins dürfen durch zusätzliche
Buchungen keine Tageskopien vervielfachen. Bestehende Daten werden nicht umgeschrieben.

Integrationstests gegen eine migrierte disposable `*_test`-Datenbank müssen abdecken:

- doppelte und gleichzeitige Korrekturen, verlorene Antwort und abweichende Begründung;
- erneuter Abschluss einer korrigierten Tageskopie ohne neue Vergütung;
- parallele Korrektur und Einlösung/Buddy-Ausgabe bei knappem Guthaben;
- paralleler Aufgabenabschluss und Korrektur ohne widersprüchlichen Zustand;
- bereits ausgegebene Sterne, vollständiger Rollback und erfolgreicher späterer Versuch;
- Null-Sterne-Aufgabe, historische und aktuelle Kopie sowie archiviertes Kind;
- fremder Haushalt, falsche Kinderzuordnung, manipulierte Beträge und fehlende Bestätigung;
- Wandgerät, Launcher, Buddy-Token, Bearer plus Elterncookie und ungültiger Origin;
- unveränderte Originalbuchung und Tageskopie nach Vorlagenänderung;
- Familienzeitzone am Tageswechsel, fehlende Tageskopie und begrenzter Verlauf;
- korrekte Trennung von Gesamtverdienst, Guthaben und Ausgaben in allen Lesemodellen.

Danach `npm run check`, `npm run build` und `npm run test:integration` ausführen.
Der Implementierungs-PR braucht einen Screenshot der tatsächlichen Elternansicht
mit fiktiven Profilen als kanonischen GitHub-Anhang. Dieser Dokumentationsentwurf
liefert weder Laufzeitnachweis noch UI-Screenshot und darf nicht als vollständige
Umsetzung von #52 behandelt werden.
