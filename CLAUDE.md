# HomeFix AI Development Rules

This repository is currently in the standards-first phase. No product implementation should be added until these rules are preserved and the quality gates are executable.

## Non-Negotiable Workflow

1. Read the related files before editing.
2. Keep changes small, intentional, and scoped to the request.
3. Do not add business logic in JavaScript. Application code must be TypeScript.
4. Do not bypass lint, typecheck, tests, or review requirements to make progress appear faster.
5. Never commit secrets, real credentials, production tokens, private keys, or customer data.
6. Do not execute real payments, transfers, notifications, or provider-side production actions.

## Quality Gates

Every implementation change must pass:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

For local convenience, run:

```bash
npm run quality
```

## Architecture Targets

The expected future project layout is:

```text
app/
  src/
    components/
    hooks/
    navigation/
    screens/
    services/
    store/
    types/
    utils/
server/
  src/
    controllers/
    middlewares/
    models/
    routes/
    services/
    types/
    utils/
shared/
tests/
```

## Coding Standards

- Public functions must have explicit parameter and return types.
- `any` is forbidden. Use precise types, generics, `unknown`, or validated schemas.
- External input must be validated at the boundary before use.
- Controllers should translate request/response only; business logic belongs in services.
- Errors must be handled through consistent error boundaries or middleware.
- Authorization must be enforced server-side for orders, payments, reviews, profile changes, and worker/customer actions.
- Sensitive operations must be auditable and idempotent where practical.

## Security Fix Ledger

When fixing a security issue or vulnerability, follow the ledger at `docs/security-fixes.md`:

- Read it first. If a prior entry covers the same class of problem, reuse its canonical fix and regression-test pattern so similar vulnerabilities are always resolved consistently. Do not invent a new approach for an already-solved class.
- After the fix, append a `SEC-NNNN` entry (root cause, canonical fix, regression test, prevention) and reference the id in the PR and commit.
- Add a regression test with every security fix. For auth, payments, matching, and order state this is mandatory.

## AI Assistant Guardrails

- Prefer editing existing files over creating new files unless the requested change needs one.
- Do not introduce new libraries without explaining why the standard library or existing dependency is insufficient.
- Do not hide uncertainty. If a behavior, dependency, API, or law may have changed, verify it first.
- Add tests with feature work. For security, matching, payments, auth, and order state, missing tests are a blocker.
- Avoid broad rewrites during feature work. Refactor only when it directly lowers risk for the requested change.
