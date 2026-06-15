# Security Fix Ledger

An append-only record of every security and vulnerability fix, so that similar issues are always resolved the same way. This file is the single source of truth for "how we fixed X": consult it before fixing, and update it after. The goal is consistency — the same class of vulnerability must not be fixed three different ways.

## How to use this ledger

Before fixing a security issue or vulnerability:

1. Search this file for the same category or symptom.
2. If a prior entry exists, reuse its canonical fix and regression-test pattern. Do not invent a new approach for an already-solved class of problem.
3. If the situation genuinely differs, extend the existing entry or add a related one and link them with their `SEC-NNNN` ids.

After the fix is merged:

1. Add a new entry using the template below, or update an existing one.
2. Give it the next `SEC-NNNN` id and add a row to the index.
3. Reference the entry id in the PR description and the commit message.

## Enforcement

- The `Security Ledger` CI workflow fails any PR that ticks the security-fix checklist item without adding a new `SEC-NNNN` entry here.
- This file and `SECURITY.md` are code-owner protected (`.github/CODEOWNERS`) and require security-reviewer approval once branch protection is enabled.

## Categories

Use exactly one of: `authentication`, `authorization`, `input-validation`, `injection`, `secrets-exposure`, `payment-integrity`, `idempotency`, `dependency`, `data-exposure`, `session`, `rate-limiting`, `other`.

## Index

| ID       | Date       | Category      | Title                                              | Status  |
| -------- | ---------- | ------------- | -------------------------------------------------- | ------- |
| SEC-0001 | 2026-06-14 | authorization | (Example) Missing server-side authz on order PATCH | example |

## Entry template

Copy this block for every new fix.

### SEC-NNNN — <short title>

- **Date:** YYYY-MM-DD
- **Category:** <one category from the list above>
- **Severity:** low | medium | high | critical
- **Affected area:** <file / module / endpoint>
- **Vulnerability:** <what was wrong and how it could be abused>
- **Root cause:** <why it happened>
- **Canonical fix:** <the agreed, reusable pattern to apply for this whole class — be specific>
- **Regression test:** <path to the test that locks this in>
- **Prevention:** <lint rule, gate, type, or review check that stops recurrence>
- **Related:** <SEC-xxxx ids, or none>

---

### SEC-0001 — (Example) Missing server-side authorization on order PATCH

> Example entry to show the format. Delete it once the first real fix is recorded.

- **Date:** 2026-06-14
- **Category:** authorization
- **Severity:** high
- **Affected area:** `server/src/controllers/orderController` (PATCH /orders/:id)
- **Vulnerability:** The endpoint trusted a client-supplied ownership flag, letting any authenticated user modify another user's order.
- **Root cause:** The authorization decision was made on the client and only echoed by the server; the controller mixed authorization with request handling.
- **Canonical fix:** Enforce authorization in a server-side service/middleware that loads the resource owner and compares it to the authenticated principal. Never trust client-provided identity, role, or ownership fields. Apply the same `assertCanAct(principal, resource, action)` helper to every order, payment, review, and profile mutation.
- **Regression test:** `server/tests/authorization/orderUpdate.authz.test.ts`
- **Prevention:** Server-side authorization checklist item in the PR template; an integration test asserting a non-owner receives 403.
- **Related:** none
