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

### Screenshot attachments in private repositories

Use GitHub CLI 2.99.0 or newer (`gh pr edit --help` must list `--attach`). Raw or blob image URLs from this private repository do not reliably render in issue and PR bodies. Upload actual GitHub attachments instead, following the [Flexpane attachment workflow](https://github.com/Florian-Cullmann/flexpane/pull/33).

1. Inspect the screenshot locally and use only safe, fictional data.
2. Place the body draft and screenshot in the same temporary directory. Reference the local image in the draft, for example `![Completed task](screenshot.png)`.
3. Upload the referenced file with the body:

   ```sh
   gh pr edit 123 --body-file /tmp/pr-proof/body.md --attach /tmp/pr-proof/screenshot.png
   ```

   `gh pr create` supports the same flags. Repeat `--attach` for multiple images. The CLI replaces local references with canonical `https://github.com/user-attachments/assets/<id>` URLs.

4. Read the saved body back with `gh pr view 123 --json body --jq .body`. Confirm that captions remain and all inline images use canonical attachment URLs, with no local paths, private raw/blob URLs or temporary signed download URLs. Verify the attachment through authenticated `gh api` and compare its bytes with the local capture; do not claim browser rendering was checked unless it actually was.
5. Reuse those canonical URLs for later text edits. If an upload fails, inspect the saved PR before retrying because some attachments may already have succeeded.

Do not publish private screenshots on public image hosts. Ordinary proof screenshots need not be committed unless they also serve maintained documentation or fixtures. For issue bodies, use the corresponding `gh issue create/edit --attach` workflow.

Report platform assumptions, new dependencies and verification limits. Android app compilation, emulator checks and physical managed-device tests are different levels of evidence; distinguish them.
