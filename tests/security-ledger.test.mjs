import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffAddsSecEntry, isSecurityFixDeclared } from '../scripts/check-security-ledger.mjs';

describe('isSecurityFixDeclared', () => {
  it('returns true when the security-fix checklist item is checked', () => {
    const body = '- [x] If this is a security fix, `docs/security-fixes.md` was consulted';

    assert.equal(isSecurityFixDeclared(body), true);
  });

  it('returns false when the security-fix checklist item is unchecked', () => {
    const body = '- [ ] If this is a security fix, `docs/security-fixes.md` was consulted';

    assert.equal(isSecurityFixDeclared(body), false);
  });

  it('returns false for non-string PR bodies', () => {
    assert.equal(isSecurityFixDeclared(undefined), false);
  });
});

describe('diffAddsSecEntry', () => {
  it('returns true when the diff adds a SEC-NNNN ledger id', () => {
    assert.equal(diffAddsSecEntry('+### SEC-0002 — fix leaked refresh token'), true);
  });

  it('returns false when the diff adds no SEC id', () => {
    assert.equal(diffAddsSecEntry('+ some unrelated documentation line'), false);
  });
});
