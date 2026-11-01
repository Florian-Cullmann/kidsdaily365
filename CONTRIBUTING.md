# Contributing to KidsDaily365

## Required workflow

Every change uses a dedicated branch and a pull request, including coding-agent work. Issues are mandatory for features, larger bug fixes and significant refactoring. They are optional for small, obvious fixes, minor documentation, formatting, routine dependency updates and trivial maintenance. Reuse an existing applicable issue. Do not create issues just to fill a template.

1. Find or create the issue before implementation when required; describe the concrete problem, scope and intended result. Discuss large changes before starting them.
2. Branch from `main`, e.g. `feat/12-android-pairing`, including an issue number when applicable.
3. Implement and run appropriate checks, then commit and push that branch.
4. Open a PR with the resulting behavior, validation and limitations. Use `Closes #123` only when the issue is resolved.
5. Integrate through the PR. Never commit or push directly to `main`, even for documentation or small fixes.

Dependency-bot PRs do not need a separate issue. Vulnerabilities follow [SECURITY.md](SECURITY.md), not a public issue. This workflow and its Proof of Done requirement are adapted from `openwebprint`.

## Development and validation

Use Node.js 24 LTS, `npm ci`, then [README.md](README.md) for demo/live setup. UI and API use Next.js; persistence lives under `src/server/`. Android development lives under `apps/android/` with its own build instructions.

For application code run `npm run check` and `npm run build`. For persistence or authorization changes also run migrations and `npm run test:integration` against a disposable PostgreSQL database named `*_test`. Generate and commit migrations; never schema-push against deployed data. For documentation-only changes check links and the diff; app tests are unnecessary if runtime behavior is unchanged.

Add tests for real regressions: cross-family access, a launcher mutating data, credential/session leakage, double points, lost history or broken user journeys. Do not write tests just to assert types, CSS names or implementation details. Stubbed transport and demo data are not real-device security evidence. Never make CI depend on a family phone or LAN server.

## Proof of Done

Every PR, including maintainer and agent PRs, must include **Proof of Done**. Capture the actual implemented result whenever possible, especially for UI changes; embed/attach a screenshot with a short caption. Use fictional profiles and omit credentials, pairing codes, private URLs and actual child data. Mockups do not count as completion evidence.

If a screenshot is not meaningful or cannot be captured, explain why in the PR and provide relevant alternative evidence such as focused test results, a validated migration or compiler output. Never silently omit Proof of Done. Screenshots supplement the required checks.

Report platform assumptions, new dependencies and verification limits. Android app compilation, emulator checks and physical managed-device tests are different levels of evidence; distinguish them.
