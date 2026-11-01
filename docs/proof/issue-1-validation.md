# Issue #1 – Nachweise

Die Screenshots zeigen den tatsächlich laufenden Next.js-Produktionsbuild mit einer lokalen, wegwerfbaren PostgreSQL-Testdatenbank. Alle Namen, E-Mail-Adressen, Profile und Geräte sind fiktiv. Keine Einrichtungs-, Sitzungs-, Geräte- oder Einladungscodes sind abgebildet.

- `issue-1-parent-overview.png`: Angemeldeter Elternbereich mit Navigation für Profile, Pläne, Apps, Geräte und Konten.
- `issue-1-child-profiles.png`: Zwei dauerhaft gespeicherte Kinderprofile mit unterschiedlichen Buddys; das zweite Profil wurde über das echte Browserformular angelegt. Die grüne Rückmeldung stammt von erfolgreicher Speicherung.

## Lokal geprüft

- `npm run check`: ESLint, TypeScript und 17 Unit-/API-Grenztests.
- `npm run test:integration`: 18 Tests gegen echtes PostgreSQL 16.15. Geprüft werden unter anderem konkurrierende Erstregistrierung/Einladung, scrypt-Anmeldung, Ablauf/Widerruf/Passwortwechsel/Operator-Recovery, ein verspäteter Login mit altem Passwort während eines Passwortwechsels, Familiengrenzen, Wochentage, gleichzeitiges Abhaken/Bearbeiten, einmalige Gerätecodenutzung und ausschließlich lesende Android-Rechte.
- `npm run test:http` gegen den echten Standalone-Produktionsserver: Registrierung, Login/Logout, Profil-/Plan-/Termin-/Wunsch-/App-Verwaltung, Wand- und Android-Pairing, Sternestand vor/nach Aufgabenabschluss, Schreibverweigerung, Wiederholbarkeit, Gerätwiderruf und anschließendes Entfernen des Testhaushalts.
- Browser mit fiktivem bestehendem Elternkonto: Login, Profilanlage mit anderem Buddy und gespeicherter Rückmeldung; Wechsel zum Kinderbildschirm beendet die Elternsitzung, anschließender Elternaufruf verlangt Login.
- `docker compose config --quiet` mit fiktiven Variablen.
- Android: eigener nativer Build und Android Lint mit JDK 17/SDK 36. Die Mindestplattform ist Android 13/API 33; kein Telefon wurde provisioniert oder gesperrt.

GitHub Actions prüft zusätzlich Node.js 24, PostgreSQL 18, beide Docker-Targets, den HTTP-Workflow im fertigen Runtime-Container und den Android-Build. Der jeweilige PR-Check ist die maßgebliche Aussage über den Abschluss dieses CI-Laufs.

## Verifikationsgrenzen

Auf diesem Rechner läuft kein Docker-Daemon; Container-Ausführung wird in CI geprüft. Es wurde kein Xiaomi-/HyperOS-/LineageOS-Gerät verbunden oder verändert. Das native Android-Projekt ist eine offen als ungeschützt gekennzeichnete Vorschau. Die echte Gerätesperre und der physische Geräte-Nachweis sind Aufgabe von Issue #2; E-Mail-Versand, MFA, Belohnungseinlösung und Kosmetikkäufe sind nicht umgesetzt.
