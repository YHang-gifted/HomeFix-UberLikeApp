import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseScheduledTime,
  validateCreateRequestForm,
} from '../app/src/features/serviceRequests/createRequestForm.ts';

function validValues() {
  return {
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    latitude: '25.03',
    longitude: '121.56',
  };
}

describe('validateCreateRequestForm', () => {
  it('returns no errors for valid input', () => {
    assert.deepEqual(validateCreateRequestForm(validValues()), {});
  });

  it('flags an unknown category', () => {
    const errors = validateCreateRequestForm({ ...validValues(), category: 'spaceship' });
    assert.equal(typeof errors.category, 'string');
  });

  it('flags an empty description', () => {
    const errors = validateCreateRequestForm({ ...validValues(), description: '   ' });
    assert.equal(typeof errors.description, 'string');
  });

  it('flags out-of-range and non-numeric coordinates', () => {
    const errors = validateCreateRequestForm({
      ...validValues(),
      latitude: '120',
      longitude: 'abc',
    });
    assert.equal(typeof errors.latitude, 'string');
    assert.equal(typeof errors.longitude, 'string');
  });
});

describe('parseScheduledTime', () => {
  it('treats an empty value as no preference', () => {
    assert.deepEqual(parseScheduledTime('   '), { ok: true, iso: undefined });
  });

  it('converts a parseable date to an ISO string', () => {
    const result = parseScheduledTime('2026-07-01T09:00:00.000Z');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.iso, '2026-07-01T09:00:00.000Z');
  });

  it('rejects an unparseable value', () => {
    assert.deepEqual(parseScheduledTime('next tuesday'), { ok: false });
  });
});
