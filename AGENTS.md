# KidsDaily365

## Required GitHub workflow

Every project change must use a dedicated branch and a pull request, including work performed by coding agents. Keep the process lightweight and welcoming to contributors.

- GitHub issues are mandatory for features, larger bug fixes, and significant refactoring.
- Issues are optional for small, obvious bug fixes, minor documentation changes, formatting, routine dependency updates, and trivial maintenance. Small, obvious bug fixes may be submitted directly as a PR; describe the problem and fix in the PR.
- Reuse an applicable existing issue. Do not create unnecessary issues solely to satisfy the workflow.

1. Before implementation, find or create an issue when required. Keep its scope and intended outcome concrete; discuss large changes before starting them.
2. Work on a dedicated branch based on `main`. Include the issue number in the branch name when one applies and it is practical.
3. Run checks appropriate to the change, then commit and push the working branch.
4. Open a pull request and reference an existing issue when applicable. Use `Closes #123` when the PR resolves that issue. Describe the resulting behavior, meaningful validation, and remaining limitations. Include a screenshot of the actual implemented result as **Proof of Done** whenever possible; this requirement also applies to maintainers and coding agents. If a screenshot is not meaningful or cannot be captured, explicitly explain why in the PR and provide alternative verification evidence. Follow the screenshot guidance in [CONTRIBUTING.md](CONTRIBUTING.md); screenshots do not replace required checks.
5. Changes reach `main` through a pull request. Do not commit or push directly to `main`, including for small fixes or documentation-only changes.

Routine dependency-bot pull requests can proceed without a separate issue. For security vulnerabilities, follow the private reporting process in [SECURITY.md](SECURITY.md); do not publish sensitive details merely to create a public issue.

See [CONTRIBUTING.md](CONTRIBUTING.md). Report the pull request link and applicable issue link when handing off completed work. These workflow rules are adapted from `openwebprint`.

## Product and architecture

- Product language: German. Build for a shared 14-inch Windows touch display; start with a child profile picker.
- Keep this a self-hosted, single-household modular monolith. App Router UI/API, server-side services, PostgreSQL/Drizzle. Maintain separate parent, wall-display and Android-launcher authorization boundaries.
- Child profiles own their tasks, points, appointments and buddy. A profile selection is not authentication; the shared device must be paired.
- Keep database access under `src/server/`. Scope every query/mutation to the configured household. Never trust client-supplied point amounts or household IDs.
- Points are earned once per task through the journal's unique constraint. Preserve daily snapshots and completed history.
- Use family-local dates, UTC appointment instants. Never derive a child's day from server-local time.
- Calm defaults: large touch targets, predictable navigation, no automatic sound, flashing or pressure from streak loss.
- Run `npm run check` and `npm run build`. For persistence/auth changes also run integration tests against a migrated disposable `*_test` PostgreSQL database.
- Generate and commit migrations when the schema changes; do not use schema push against deployed data.
- Keep secrets, actual child data, backups and `.env` out of Git. Follow the user's global preference to commit and push completed implementation work.
- Android is a native launcher plus device-policy controller, not a WebView with browser credentials. Launcher tokens are child-bound and read-only. Never allow task completion, parent management, point changes or purchases with a launcher token.
- Genuine Android restrictions require Device Owner / dedicated-device provisioning. Do not describe a normal launcher, immersive UI or screen pinning as a secure kiosk. Keep parental maintenance/recovery and emergency access explicit.
