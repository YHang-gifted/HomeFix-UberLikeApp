# Contributing

HomeFix uses a strict quality-first workflow. Human contributors and AI assistants follow the same rules.

## Branches

Use short kebab-case branch names:

- `feature/<scope>`
- `fix/<scope>`
- `chore/<scope>`
- `docs/<scope>`

The stable branch is `main`. Integration branches may be introduced later when active development begins.

## Commits

Use Conventional Commits:

```text
feat(matching): add distance ranking rules
fix(auth): reject expired refresh tokens
docs(quality): clarify AI review checklist
```

Allowed types:

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `test`
- `chore`
- `ci`

## Pull Requests

Before requesting review:

```bash
npm run quality
npm test
```

Every PR must explain:

- What changed
- Why it changed
- How it was tested
- What risks remain

## Security Fixes

Security fixes follow `docs/security-fixes.md` (the Security Fix Ledger):

- Consult the ledger first and reuse the canonical fix for the matching category instead of inventing a new approach.
- Add or update a `SEC-NNNN` entry in the same PR and tick the security-fix item in the PR checklist.
- The `Security Ledger` CI workflow blocks any PR that declares a security fix without adding a new `SEC-NNNN` entry.
- `docs/security-fixes.md` and `SECURITY.md` are code-owner protected (see `.github/CODEOWNERS`); changes require security-reviewer approval once branch protection is enabled.

## Review Standard

Reviewers should block changes that:

- Use `any` or unsafe type escapes without a justified exception
- Add business logic without tests
- Trust frontend authorization for sensitive actions
- Skip validation for external input
- Introduce secrets or production-only data
- Add dependencies without clear need
- Weaken lint, typecheck, test, or CI rules
