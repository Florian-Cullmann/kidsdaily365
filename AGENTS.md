# KidsDaily365

- Product language: German. Build for a shared 14-inch Windows touch display; start with a child profile picker.
- Keep this a self-hosted, single-household modular monolith. App Router UI/API, server-side services, PostgreSQL/Drizzle.
- Child profiles own their tasks, points, appointments and buddy. A profile selection is not authentication; the shared device must be paired.
- Keep database access under `src/server/`. Scope every query/mutation to the configured household. Never trust client-supplied point amounts or household IDs.
- Points are earned once per task through the journal's unique constraint. Preserve daily snapshots and completed history.
- Use family-local dates, UTC appointment instants. Never derive a child's day from server-local time.
- Calm defaults: large touch targets, predictable navigation, no automatic sound, flashing or pressure from streak loss.
- Run `npm run check` and `npm run build`. For persistence/auth changes also run integration tests against a migrated disposable `*_test` PostgreSQL database.
- Generate and commit migrations when the schema changes; do not use schema push against deployed data.
- Keep secrets, actual child data, backups and `.env` out of Git. Follow the user's global preference to commit and push completed implementation work.
