# KidsDaily365

Eine selbst gehostete Familien-App für einen 14-Zoll-Wand-Touchscreen. Kinder wählen ihr Profil, sehen einen übersichtlichen Tagesplan und sammeln mit jedem erledigten Schritt eigene Sterne. Die Oberfläche orientiert sich an einer freundlichen, ruhigen Spielwelt; Buddy-Grafiken sind zunächst Emoji-Platzhalter.

**Stand: Architektur und lauffähiges Grundgerüst**, keine fertige Familienverwaltung. Die Profilauswahl, getrennte Tagespläne, Aufgabenabschluss, Punktejournal, persönliche Buddys und Terminanzeige funktionieren. Elternverwaltung, frei konfigurierbare Routinen, Wiederholungsregeln, Belohnungseinlösung und individuelle Buddy-Grafiken folgen in weiteren Schritten.

## Lokal starten

Voraussetzung: Node.js 24 LTS und npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

`http://localhost:3000` öffnet zuerst die Profilauswahl mit zwei fiktiven Kindern. `APP_MODE=demo` braucht keine Datenbank. Abhaken funktioniert nur im Arbeitsspeicher dieses Tabs und wird beim Neuladen zurückgesetzt. Profilwechsel innerhalb des Tabs erhält den Fortschritt. Der Demo-Modus lässt keine API-Schreibzugriffe zu.

## Architektur

```text
Windows / Edge im Kiosk-Modus
          │ HTTP im LAN, optional HTTPS über Reverse Proxy
          ▼
Next.js: Profilauswahl → persönlicher Tagesplan
          │ gleiches Origin, HttpOnly-Gerätesitzung
          ▼
Route Handlers → Familien-/Tagesplan-Service → Drizzle
          │
          ▼
PostgreSQL 18 auf Unraid, persistentes appdata-Verzeichnis
```

Ein modularer Monolith hält Betrieb und Entwicklung einfach. UI und API liegen unter derselben Adresse; ein späterer Desktop-Rahmen kann dieselbe Website anzeigen. Daten verlassen den eigenen Server nicht über Analyse-, Schrift- oder Mediendienste.

- `src/domain/`: Datentypen, Tagesabschnitte, Datumslogik und Demodaten.
- `src/components/`: Profilauswahl und touchfreundlicher Familienbildschirm.
- `src/app/api/`: Gerätefreigabe, Aufgabenabschluss, Healthcheck.
- `src/server/`: Konfiguration, Geräteauthentifizierung und fachliche Dienste.
- `src/server/db/`, `drizzle/`: Schema und versionierte Migrationen.
- `docs/architecture.md`: Datenmodell, Grenzen und nächste Ausbauschritte.
- `docs/unraid.md`: Einrichtung, Kiosk, Sicherung und Updates.

## Live-Modus

Die vollständige Einrichtung steht in [docs/unraid.md](docs/unraid.md). `.env.example` beschreibt die Variablen. Docker Compose erzwingt `APP_MODE=live` und verlangt eigene Secrets. Ein frischer Live-Bildschirm fragt vor dem Zugriff auf Familiendaten nach dem Gerätecode.

```sh
docker compose up -d --build
docker compose run --rm migrate npm run db:seed
```

Der normale Seed legt nur die Familie an. Solange die Elternverwaltung fehlt, kann man **explizit fiktive Beispielprofile** als Entwicklungsbasis anlegen:

```sh
docker compose run --rm migrate npm run db:seed -- --example
```

Nach der Freigabe werden Routinen beim Laden des jeweiligen Tages als einmalige Aufgabenkopien angelegt. Der Seed überschreibt keine bestehenden Datensätze. Produktive Kinderprofile werden in dieser Phase noch über die Datenbank eingerichtet; der sichere Elternbereich ist der nächste Funktionsblock.

## Prüfen

```sh
npm run check
npm run build
# Nur gegen eine separate, migrierte Datenbank mit Namen *_test:
DATABASE_URL=postgres://…/kidsdaily_test npm run db:migrate
DATABASE_URL=postgres://…/kidsdaily_test npm run test:integration
```

GitHub Actions prüft zusätzlich mit echtem PostgreSQL: paralleles Abhaken, Isolation der Familien/Kinder, Tageswechsel, unveränderliche Tageskopien und Termine. Unit-Tests prüfen Geräte-Signaturen, Ablaufzeiten, Datumsgrenzen und unabhängige Demoprofile.

## Bewusste Grenzen

- Ein Haushalt pro Installation; die Datenbank hat bereits Familiengrenzen. Profilauswahl unter Geschwistern ist bewusst ohne PIN. Das Gerät hat Lese-/Abhakrechte für alle Kinder der eigenen Familie.
- Kein Offline-Schreiben, Service Worker oder geräteübergreifender Live-Abgleich. Erfolgreiche Speicherung wird erst nach Serverantwort angezeigt. Andere Bildschirme brauchen vorerst ein Neuladen.
- Buddys sind feste Profilzuordnungen; Belohnungen sind nur sichtbare Ziele, noch nicht einlösbar. Punkte werden nicht abgezogen.
- Basis-Webmanifest und Vollbildknopf vorhanden; installierbare Offline-PWA und native Windows-App sind nicht Teil dieses Grundgerüsts.
- Standardmäßig keine Animationen, Sounds, Ranglisten oder Streak-Strafen. Motivierendes Feedback und Sterne sind planbar und nicht zufallsbasiert.
