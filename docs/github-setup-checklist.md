# GitHub Setup Checklist

One-time repository settings that activate the quality gates and the Security Fix Ledger enforcement. The workflows and `CODEOWNERS` file are already in the repo; GitHub still needs these settings turned on for them to block merges.

## 1. Set the code owners

Edit `.github/CODEOWNERS` and replace the placeholder `@your-org/security-reviewers` with a real GitHub team (for example `@homefix/security`) or one or more usernames (for example `@alice @bob`).

- A team must have write access to the repository to be a valid code owner.
- The named owners will be auto-requested for review whenever `docs/security-fixes.md` or `SECURITY.md` changes.

## 2. Protect the `main` branch

Settings → Branches → Add branch ruleset (or "Add classic branch protection rule"), target branch `main`:

- [ ] Require a pull request before merging
- [ ] Require approvals (at least 1)
- [ ] Require review from Code Owners
- [ ] Require status checks to pass before merging
- [ ] Require branches to be up to date before merging
- [ ] Do not allow bypassing the above settings (recommended)

## 3. Make the CI checks required

Under "Require status checks to pass", search for and select these checks (they appear in the list once each workflow has run at least once on a PR):

- [ ] `Quality Gates` — from `.github/workflows/ci.yml` (format, lint, typecheck, test, security audit)
- [ ] `Require ledger entry for security fixes` — from `.github/workflows/security-ledger.yml`

If a check is not yet listed, open a throwaway PR so the workflow runs once, then it becomes selectable.

## 4. Verify it works

1. Branch from `main`, tick the "If this is a security fix..." box in the PR template, but do not edit `docs/security-fixes.md`.
2. Open the PR. The `Require ledger entry for security fixes` check must fail and block merge.
3. Add a `SEC-NNNN` entry to `docs/security-fixes.md`, push, and confirm the check turns green.
4. Confirm that editing `docs/security-fixes.md` or `SECURITY.md` auto-requests a code-owner review.

## Notes

- The `Security Ledger` check only enforces that a ledger entry exists when the security-fix box is ticked; it does not judge fix quality — that is the reviewer's job per `CONTRIBUTING.md`.
- Keep `node-version-file: .nvmrc` in sync with `engines.node` in `package.json`.
