# Security Policy

Security-sensitive areas include authentication, authorization, payments, worker verification, customer data, order state transitions, geolocation, notifications, and review/rating integrity.

## Required Practices

- Store secrets only in environment variables or a managed secret store.
- Validate all external input before it reaches business logic.
- Enforce authorization on the server for every sensitive action.
- Use least-privilege credentials for third-party services.
- Log security events without logging secrets or sensitive personal data.
- Treat payment and payout operations as idempotent and auditable.

## Prohibited Practices

- Committing `.env`, API keys, private keys, tokens, or production customer data
- Trusting client-side checks for authorization
- Swallowing errors silently
- Using real payment credentials in local tests
- Disabling security checks to unblock development

## Fix Ledger

Every security fix is recorded in `docs/security-fixes.md`. Before fixing a vulnerability, consult the ledger and reuse the established remediation pattern for that category; after fixing, add or update the corresponding `SEC-NNNN` entry. This keeps fixes for similar vulnerabilities consistent over time.

## Reporting

During early development, report security issues in a private issue or direct maintainer channel. Do not disclose exploitable details in public PR descriptions.
