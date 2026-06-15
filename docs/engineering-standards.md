# Engineering Standards

This document defines the quality bar before feature development begins.

## Definition of Done

A change is not done until:

- Formatting passes
- Lint passes with zero errors
- TypeScript passes with strict checks
- Relevant tests pass
- The PR describes verification and residual risk
- Security-sensitive behavior has server-side checks

## TypeScript

- Use strict TypeScript for all application code.
- Prefer domain-specific types over primitive strings and numbers.
- Use `unknown` for untrusted values until validated.
- Avoid type assertions except at trusted integration boundaries.

## Testing

Required test coverage grows with risk:

- Utility and pure domain logic: unit tests
- Order state, matching, auth, payment, payout, review flows: unit and integration tests
- API boundaries: validation and authorization tests
- Critical bug fixes: regression tests

## Dependency Policy

Add dependencies only when they materially reduce risk or complexity. A PR adding a dependency must explain:

- Why it is needed
- Why existing tools are insufficient
- Security and maintenance risk
- Bundle/runtime impact when relevant

## Exceptions

Temporary exceptions must be documented in the PR with:

- The rule being bypassed
- Why the exception is necessary
- The follow-up issue or removal plan
