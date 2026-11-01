# Native Android-Vorbereitung

Dieses Verzeichnis ist das **kompilierbare native Grundgerüst**, noch keine abgesicherte Kinder-Handy-App. Die Vorschau ist ausdrücklich als ungeschützt gekennzeichnet. Sie registriert einen normalen HOME-Einstieg, erzwingt aber keine Standard-Home-Zuordnung, keine Systemsperren und keine Geräteverwaltung. Sie verbindet sich noch nicht mit dem Backend. Aufgabenabschluss und Käufe sind nicht vorhanden.

Die vollständige verwaltete Umsetzung ist [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2). Sie darf erst nach Einrichtung eines elterlichen Wartungs-/Recovery-Zugangs Schutzregeln aktivieren. Provisionierung oder Zurücksetzen eines realen Handys ist nicht Teil dieses Grundgerüsts.

## Aufbau

- `app/`: native Kotlin-App; keine WebView und keine Eltern-/Browsercookies.
- `MainActivity`: Vorschau und späterer Home-Einstieg.
- `LauncherRepository`: ausschließlich lesender Port mit DTOs für den Backend-Snapshot.
- `gradle/wrapper/`: Gradle 8.14.6, Distribution per SHA-256 festgelegt; offizieller Wrapper geprüft.
- Android Gradle Plugin 8.13.2, Kotlin 2.2.21, JDK 17; `minSdk 33` (Android 13), `compileSdk/targetSdk 36` als Entwicklungsbasis. Die unterstützte Basis umfasst damit mehrere Android-Generationen ohne Altgeräte-Kompatibilität. Neuere Android-Versionen und Herstellergeräte benötigen eigene Tests.
- Zielgerät: Xiaomi mit HyperOS; die ersten physischen Entwicklungstests finden auf einem Xiaomi mit LineageOS statt. Ein LineageOS-Test gilt nicht automatisch als HyperOS-Nachweis. Konkretes Modell, Android-Version, Patchstand und Bootloader-/Root-Zustand pro Testlauf dokumentieren.

## Bauen

Android SDK 36 und JDK 17 installieren; Android Studio kann den Ordner direkt öffnen. SDK-Pfad über `ANDROID_HOME` oder eine lokale, ignorierte `local.properties` setzen.

```sh
cd apps/android
./gradlew assembleDebug lintDebug
```

Die APK unter `app/build/outputs/apk/debug/` ist eine Entwicklungsvorschau und wird nicht automatisch auf ein Gerät installiert. Eine erfolgreiche Kompilierung ist kein Nachweis, dass Kamera, Systemleisten oder Recents auf einem bestimmten Telefon gesperrt sind.

## Backend-Grenze

Ein Elternteil erstellt unter `/eltern` einen Android-Gerätecode für genau ein Kind. Die spätere App tauscht ihn einmalig gegen einen eigenen Bearer-Token und liest `GET /api/launcher/snapshot` alle fünf Sekunden im Vordergrund. Der Server verweigert mit diesem Token Aufgabenabschluss und Elternverwaltung. Die DTOs bilden den Vertrag unter `src/domain/launcher.ts` ab; der spätere JSON-Adapter muss Version, Größenlimits und alle Berechtigungsfelder vor Verwendung validieren. Kotlin-Standardwerte oder ein unbekannter Serverwert dürfen keine Rechte erweitern.

Details zu Device Owner, App-Freigaben, Boot-Verhalten, Offline-Policy und Recovery stehen in [docs/android.md](../../docs/android.md).
