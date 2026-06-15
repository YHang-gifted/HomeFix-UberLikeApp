import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hasNulByte, validateJsonText } from '../scripts/check-file-integrity.mjs';

describe('hasNulByte', () => {
  it('returns true when a NUL byte is present', () => {
    assert.equal(hasNulByte(Buffer.from([0x61, 0x00, 0x62])), true);
  });

  it('returns false for clean text', () => {
    assert.equal(hasNulByte(Buffer.from('abcdef')), false);
  });
});

describe('validateJsonText', () => {
  it('accepts valid JSON', () => {
    assert.equal(validateJsonText('{ "a": 1 }').ok, true);
  });

  it('rejects invalid JSON', () => {
    assert.equal(validateJsonText('{ "a": 1').ok, false);
  });
});
