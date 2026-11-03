# Nativer Android-Launcher · Vorschau

Die native Kotlin-App zeigt Buddy und Live-Sterne eines fest zugeordneten Kindes und öffnet freigegebene installierte Apps. Aufgabenabschluss, Elternverwaltung und Käufe sind nicht vorhanden. Eine normale Installation bleibt **ungeschützt**. Auf ausdrücklich provisionierten Device-Owner-Geräten können Eltern den verwalteten Kindermodus aktivieren: Multi-App Lock Task, Kamera-/Systemleisten-Sperren und Wiederherstellung beim Boot. Die physische Abnahme auf Xiaomi/LineageOS und Xiaomi/HyperOS aus [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2) ist noch offen.

Die Kinderansicht zeigt den Sternestand als kompakte Pill oben links und den Buddy oben rechts. Eine ruhige Pastelllandschaft rahmt „Deine Apps“ mit kompakten App-Icons auf sanften Farbflächen und Namen darunter ein. Das Launcher-Raster nutzt drei Spalten, auf schmalen Displays oder bei vergrößerter Schrift zwei bzw. eine Spalte. Fehlende Apps bleiben mit Ersatzsymbol, Status und reduzierter Deckkraft deaktiviert. Lange Namen dürfen umbrechen; die Ansicht ist scrollbar. Der Entwicklungsvorschau-Hinweis erscheint nicht mehr auf der Oberfläche; tatsächliche Policy-Fehler bleiben sichtbar. Für die WLAN-Kinderhandys gibt es keinen eigenen Notruf-Button. Elternwartung und systemseitige Sicherheitswege bleiben erhalten.

## Bauen und prüfen

JDK 17 und Android SDK 36; Android Studio kann diesen Ordner öffnen. SDK-Pfad über `ANDROID_HOME` oder eine ignorierte `local.properties` setzen.

```sh
./gradlew testDebugUnitTest assembleDebug lintDebug assembleRelease lintRelease
```

Die installierbare Debug-APK liegt unter `app/build/outputs/apk/debug/app-debug.apk`; der Release-Build ist unsigniert. AGP 8.13.2, Kotlin 2.2.21, Gradle 8.14.6, Android 13/API 33 als Minimum, compile/target SDK 36. Coroutines Android 1.11.0 übernimmt Hintergrundarbeit und Lifecycle-Abbruch. JUnit und `org.json` werden nur für JVM-Tests verwendet.

GitHub Actions prüft beide Varianten und stellt nach erfolgreichem Android-Job die Debug-APK als `kidsdaily-android-debug` bereit (sieben Tage). Das Artefakt ist zum Testen gedacht und enthält keine Serveradresse oder Zugangsdaten.

## Verbinden

1. APK bewusst auf einem Entwicklungsgerät/Emulator installieren und öffnen. Die Installation aktiviert keine Systemsperren.
2. Im Eltern-Webbereich ein Kinderprofil anlegen und unter Geräte einen **Android**-Code für dieses Kind erstellen. Ein Wandgerätecode funktioniert hier nicht. Codes gelten zehn Minuten und sind einmalig.
3. In der App die Serveradresse ohne Pfad und den Gerätecode eingeben. Kein Elternpasswort, kein erster Registrierungscode. Standard ist HTTPS mit gültigem Zertifikat; keine TLS-Ausnahmen oder HTTP-Weiterleitungen.
4. Für lokale Entwicklung erlaubt **nur die Debug-App** zusätzlich HTTP mit einer privaten IPv4-/Loopback-Adresse. Im Standard-Android-Emulator etwa `http://10.0.2.2:3000`, auf dem Handy die LAN-IP des Servers. Eine öffentliche HTTP-Adresse oder ein Hostname über HTTP wird abgewiesen. Der Release-Build erlaubt ausschließlich HTTPS. HTTP-Debug-Kopplung nur mit Testdaten in einem vertrauenswürdigen Entwicklungsnetz verwenden.
5. Buddy, Sterne und Freigaben werden im Vordergrund alle fünf Sekunden erneut gelesen. Fehlende Apps erscheinen deaktiviert mit „nicht installiert“; die App installiert nichts automatisch. Änderungen erfolgen ausschließlich im Eltern-Webbereich bzw. am Wandbildschirm.
6. Gerätezugang im Elternbereich widerrufen: Beim nächsten Abruf verschwinden Token und Kinder-Cache; die App verlangt einen neuen Code. „Verbindung trennen“ im Wartungsmodus löscht lokal dieselben Daten. Der getrennte lokale Elternzugang bleibt bei Trennung und Widerruf erhalten.

Außerhalb des LAN braucht das Telefon einen erreichbaren HTTPS-Zugang/VPN. Es gibt keinen Cloud-Relay und keinen Offline-Widerruf ohne Serverkontakt.

## Elternzugang und Offline-Wartung

Nach dem Koppeln in der Eltern-Webverwaltung unter **Geräte → Elternzugang einrichten / zurücksetzen** für genau dieses Handy eine Eltern-Bestätigung erstellen. In der Handy-App **Elternzugang → Elternzugang einrichten** öffnen, diese Bestätigung eingeben und einen eigenen Eltern-Code mit 12 bis 128 Zeichen zweimal setzen. Mehrere gut merkbare Wörter verwenden und den Code sicher außerhalb des Handys aufbewahren. Die Bestätigung gilt zehn Minuten und einmalig; ein neuer Code ersetzt vorherige Bestätigungen für dieses Gerät. Ein normaler Gerätecode oder der Kindertoken reicht dafür nicht aus.

Der lokale Code bleibt auf dem Handy. Er wird mit PBKDF2-HMAC-SHA256 (600.000 Iterationen, zufälliges 16-Byte-Salz, 256-Bit-Hash) geprüft; der Datensatz ist zusätzlich mit einem eigenen Android-Keystore-Schlüssel verschlüsselt. Es wird weder Klartextcode noch Hash an den Server übertragen. Kostenparameter orientieren sich an [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Die Code-Eingaben sind vor Screenshots, Autofill und Activity-Speicherung geschützt.

Der Eltern-Code öffnet den Wartungszugang **ohne Server** für höchstens fünf Minuten. Beim Verlassen der App, Prozess-/Geräteneustart, Rückkehr zum Kindermodus oder nach erfolgreicher neuer Kopplung schließt die Freigabe. Systemeinstellungen, Trennen, erneutes Koppeln und Ändern des lokalen Codes erfordern die Freigabe. Neue Kopplung braucht zusätzlich weiterhin einen frischen Android-Gerätecode aus der Webverwaltung. Im verwalteten Modus öffnet **Systemeinstellungen öffnen** eine getrennte, zeitlich begrenzte Wartung: höchstens die verbleibende Elternsitzung, maximal fünf Minuten. Die Sperren werden dafür gelöst. Rückkehr zu KidsDaily, Fristablauf oder Prozessneustart stellt sie wieder her. Der lokale Eltern-Code muss anschließend erneut eingegeben werden.

Fehlversuche werden vor der Hash-Prüfung dauerhaft reserviert. Ab dem fünften Fehlversuch gilt eine Wartezeit von zunächst 30 Sekunden, danach verdoppelt sie sich bis maximal 30 Minuten. App-Neustarts erhalten Zähler und Frist. Nach Geräte-Neustart startet eine noch gespeicherte Sperrfrist erneut vollständig; Änderungen der Uhrzeit verkürzen sie nicht. Erfolgreiche Anmeldung setzt die Fehlversuche zurück. Die aktive Wartungsfreigabe selbst wird niemals gespeichert.

Bei vergessenem Code: Im Eltern-Webbereich eine neue **Eltern-Bestätigung für dieses Gerät** erstellen und auf dem Handy über **Code vergessen · online zurücksetzen** einen neuen lokalen Code setzen. Das funktioniert auch bei widerrufenem/abgelaufenem Kindertoken und stellt dessen API-Zugriff nicht wieder her. Ein gültiger lokaler Code funktioniert bei Widerruf weiterhin offline. Sind Schlüssel oder Eltern-Datensatz beschädigt, braucht die App eine neue Online-Bestätigung; fehlen zusätzlich Gerätebindung und Kinderdaten vollständig, ist eine bewusste Neueinrichtung nötig. Das ist kein Offline-Ersatz für verlorene Schlüssel. Ohne lesbare Gerätebindung und ohne lokalen Eltern-Code bleibt nur die bewusste Geräte-Neueinrichtung über den Hersteller-Recovery-Weg; dabei können lokale Daten verloren gehen.

## Aufbau und Grenzen

- `LauncherProtocol`: strikte Version-1-/Version-2-Validierung einschließlich Identität, Berechtigungen und Paketnamen. Gemeinsame fiktive Vertragsdatei unter `contracts/`, geprüft durch Kotlin und Zod.
- `HttpLauncherApi`: feste Pairing-/Snapshot-Pfade, Bearer statt Browsercookies, Zeit-/Größenlimits, keine Weiterleitungen und kein Zertifikats-Bypass.
- `ConnectedLauncher`: anwendungsweite, serialisierte Kopplung/Synchronisierung/Trennung. Die Geräte-ID bleibt gebunden, die Kinder-ID ab dem ersten Snapshot ebenfalls. Bereits eingelöste Codes überleben einen fehlgeschlagenen ersten Datenabruf.
- `KeystorePrivateStore`: AES-256-GCM mit nicht exportierbarem Android-Keystore-Schlüssel und atomarem Dateiersatz im privaten, vom Backup ausgeschlossenen Speicher. Kein Klartext-Token in Preferences, Bundle oder Logs. Der Code wird nach Absenden verworfen und die Eingabeseite vor Screenshots/Recents-Vorschauen geschützt.
- `MainActivity`: ruhige native Buddy-/Sterne-Ansicht, nur App-Starts; kein WebView, keine Aufgaben oder Geschwisterdaten. Ohne Gerätesperren pausieren Abrufe außerhalb der Activity; im verwalteten Modus hält `PolicyService` die Prüfung auch in freigegebenen Apps aufrecht. Vor einem Start wird die aktuelle lokale Freigabe erneut geprüft.

Offline bleibt der letzte gültige Stand sichtbar. Freigegebene Apps lassen sich höchstens 24 Stunden nach Empfang öffnen; die Frist läuft über monotone Gerätezeit, eine zurückgestellte Uhr verlängert sie nicht. Nach Geräte-Neustart oder unbekannter Boot-Zählung ist zunächst eine erfolgreiche Online-Bestätigung nötig. Ein normaler Prozessneustart im selben Geräte-Boot erhält den Cache. Ungültige Antworten verwerfen die bisherige Startliste dauerhaft, statt zusätzliche Apps freizugeben. Eine gültige neue Antwort kann sie wiederherstellen. Im verwalteten Modus entfernt der DPC abgelaufene oder widerrufene Pakete auch aus der Android-Lock-Task-Liste; laufende gesperrte Tasks werden dadurch beendet. Ein separater lokaler Prüflauf wartet dabei nicht auf hängende Netzwerkanfragen.

Zielgerät: Xiaomi/HyperOS; erste physische Tests: Xiaomi/LineageOS. Modell, Android-Version, Patchstand und Bootloader-/Root-Zustand pro Test dokumentieren. Emulator und Compiler sind kein Nachweis der Gerätesperren. Siehe [Android-Konzept](../../docs/android.md) und [Testleitfaden](../../docs/testing.md).

Buddy-Ausstattung: [gemeinsame Ebenen, Katalog und versionierter Vertrag](../../docs/buddy-accessories.md). Der Launcher fragt Version 2 ab und zeigt ausschließlich angelegte Accessoires aus dem gebündelten Manifest.

## Device Owner bewusst provisionieren

Nur ein dafür vorgesehenes, ggf. zurückgesetztes Gerät verwenden; vorher Daten sichern und Hersteller-Recovery sowie Notrufwege kennen. Diese Schritte niemals auf einem Familienhandy ohne ausdrückliche Zustimmung ausführen. Android 13/API 33 oder neuer, primärer Nutzer, keine bestehenden Konten/Arbeitsprofile. Die APK muss für Updates weiterhin mit demselben Schlüssel signiert werden. Vor Aktivierung erlaubte Apps installieren, Audible anmelden und WLAN/VPN/HTTPS einrichten. Das dedizierte Gerät darf keine Android-PIN-/Muster-/Passwort-Bildschirmsperre haben: KidsDaily deaktiviert den Keyguard, weil die Statusleisten-Policy den Quick-Settings-Zugang am Sperrbildschirm nicht abdeckt. Die lokale Elternwartung bleibt durch den eigenen Code geschützt. Während temporärer Wartung keine neue Android-Bildschirmsperre setzen; diese würde die erneute Keyguard-Deaktivierung verhindern und als Policy-Fehler gemeldet.

Für lokale Entwicklung und kleine selbst gehostete Installationen unterstützt dieses Projekt die offizielle ADB-Testprovisionierung. Kein heimliches Enrollment, keine Accessibility-Overlays, kein automatischer Werksreset. QR-/EMM-Enrollment wird nicht angeboten.

```sh
adb install app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner de.kidsdaily365.launcher/.LauncherAdminReceiver
```

Falls Android dies ablehnt, die Voraussetzungen am Gerät prüfen; vorhandene Konten/Verwaltung nicht gewaltsam umgehen. Eine normale Geräteadministrator-Aktivierung reicht nicht aus.

1. KidsDaily öffnen, einem fiktiven Testkind zuordnen, Freigaben synchronisieren.
2. Lokalen Eltern-Code über eine Eltern-Bestätigung einrichten, sicher außerhalb des Geräts aufbewahren und einmal durch Schließen/erneutes Öffnen prüfen.
3. **Elternzugang → Gerätesperren aktivieren** ausdrücklich bestätigen. Diese Aktion ist nur als Device Owner mit gültiger Kopplung und eingerichtetem Eltern-Code möglich. Ein Server-Snapshot allein aktiviert niemals Sperren.
4. KidsDaily wird persistenter Home-Handler. Erlaubt sind der Launcher und die aktuelle validierte App-Liste. Home bleibt erreichbar, Overview/Benachrichtigungen/Quick Settings sind gesperrt. Kamera, Installationen, Deinstallationen, Nutzerwechsel, Safe Boot und Debugging werden beschränkt. ADB kann danach nicht mehr verfügbar sein.
5. Offline-Wartung, Notruf über den System-Notrufdialog bzw. das Power-Menü und die gesamte [Abnahmematrix](../../docs/android-device-acceptance.md) am tatsächlichen Gerät prüfen. Keine echten Testnotrufe absetzen. Erst nach erfolgreicher Geräteabnahme im Alltag verwenden.

**Recovery:** Eltern-Code → Systemeinstellungen für eine begrenzte Wartung oder **Gerätesperren ausschalten** für bewusst dauerhaft ungeschützten Betrieb. Letzteres entfernt die von KidsDaily gesetzten Einschränkungen und die persistente Home-Zuordnung. Device Owner bleibt eingerichtet; es findet kein stilles Entfernen der Verwaltung oder Zurücksetzen statt. Eine vollständige Außerbetriebnahme erfolgt über die bewusste Geräte-Rücksetzung in den entsperrten Systemeinstellungen. Bei verlorenem Code zuerst die Online-Eltern-Bestätigung nutzen; Hardware-Recovery ist der letzte, gegebenenfalls datenlöschende Weg.

Der Aktivierungsmarker liegt ohne Kinderdaten im gerätegeschützten Speicher. Nach Boot wird zunächst nur KidsDaily zugelassen. Elterncode/Token/Cache werden erst nach Android-Nutzerentsperrung aus dem verschlüsselten Speicher gelesen. Die Offline-App-Freigabe benötigt nach Geräteboot eine neue Serverbestätigung. Der Device-Owner-Foreground-Service ist `systemExempted`; andere Installationen starten ihn nicht. Die zugehörige eng begrenzte Lint-Ausnahme betrifft die Device-Owner-Berechtigungsalternative, nicht fehlende Alarmberechtigungen.

## Reproduzierbarer Device-Owner-Emulatortest

Nur auf einem **separaten, frischen Emulator** ohne Nutzerdaten ausführen. Der Instrumentation-Runner verweigert physische Geräte, verwendet ausschließlich fiktive Daten und einen lokalen HTTP-Fixture-Server. Er aktiviert die echten Android-Policies und löst sie abschließend wieder; Device Owner bleibt bestehen. Bei abgebrochenem Test den separaten Emulator neu erstellen. Der Test ersetzt keine OEM-/Notruf-/Audible-Abnahme und wird nicht automatisch auf angeschlossenen Telefonen ausgeführt.

```sh
./gradlew assembleDebug assembleDebugAndroidTest
adb -s emulator-5554 install app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 install app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell dpm set-device-owner de.kidsdaily365.launcher/.LauncherAdminReceiver
python3 ../../scripts/android-managed-test.py --serial emulator-5554
```

Die echte Debugging-Sperre trennt während des Tests ADB. Der Python-Runner empfängt deshalb Ergebnis und Screenshots über einen nur lokal gebundenen HTTP-Port. Ausschließlich der separate Test-APK-Code aktiviert ADB nach dem Aufheben der Sperren wieder. Der Ausgabeordner enthält die Belege; ein Timeout oder `FAILED` ist kein Erfolg.

Nach dem Test liegt die echte Kinderansicht als `files/managed-proof.png` im privaten App-Speicher des Debug-Builds. Keine Eltern-/Kopplungscodes werden aufgenommen. Testergebnis und physische Grenzen stehen in der [Abnahmematrix](../../docs/android-device-acceptance.md).

Für einen zusätzlichen Kaltstart-Test kann der Runner mit `--leave-managed` ausgeführt werden. Er lässt ausschließlich den separaten Emulator nach erfolgreichem Test verwaltet und beendet die Instrumentation nicht mit deren implizitem Force-Stop. Anschließend den Emulator beenden und denselben AVD **ohne `-wipe-data`** mit `-no-snapshot-load` neu starten (auch beim vorherigen Start muss das Speichern des AVD-Zustands erlaubt gewesen sein; nicht `-no-snapshot` verwenden), den Bildschirm bei Bedarf aufwecken und die sichere Launcher-Ansicht ohne App-Freigabe prüfen: Der Fixture-Server läuft dann nicht mehr. Diese Option führt absichtlich keine automatische Entsperrung durch; danach den Test-AVD verwerfen. Sie ist nicht für ein Telefon vorgesehen.

## Dashboard-Verwaltung und Nachrichten (ab 0.6.0)

Die zusätzliche Elternfreigabe unter **Geräte → Verwalten** aktiviert einen getrennten Verwaltungskanal für Nutzungsdaten, bestätigte Fernpausen und Nachrichten. Im nativen Launcher erscheint **Nachrichten** mit Chatverlauf, Texteingabe und ungelesenen Nachrichten. Der Chat bleibt während einer Gerätepause erreichbar. Die vorhandenen Launcher-Tokens behalten ihre Leserechte. Einrichtung, Datenspeicherung, Offline-Freigabe und Nachweisgrenzen: [Smartphone-Verwaltung](../../docs/device-management.md).
