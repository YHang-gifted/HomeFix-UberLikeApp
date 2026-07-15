import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatVisitTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../app/src/features/schedule/dateTimePicker.ts';

// slice 191: the visit-time picker replaces manual `YYYY-MM-DD HH:MM` typing. The picker yields
// a Date; these pure helpers convert to/from the web input's format and format for display.

describe('toDateTimeLocalValue', () => {
  it('formats a Date as local YYYY-MM-DDTHH:MM (not UTC)', () => {
    // Built from local parts, so it reflects the machine's wall clock regardless of timezone.
    const d = new Date(2026, 7, 1, 14, 30); // 1 Aug 2026, 14:30 local
    assert.equal(toDateTimeLocalValue(d), '2026-08-01T14:30');
  });

  it('zero-pads every field', () => {
    const d = new Date(2026, 0, 5, 9, 4); // 5 Jan 2026, 09:04
    assert.equal(toDateTimeLocalValue(d), '2026-01-05T09:04');
  });
});

describe('fromDateTimeLocalValue', () => {
  it('round-trips with toDateTimeLocalValue', () => {
    const d = new Date(2026, 7, 1, 14, 30);
    const parsed = fromDateTimeLocalValue(toDateTimeLocalValue(d));
    assert.notEqual(parsed, null);
    assert.equal(parsed.getTime(), d.getTime());
  });

  it('rejects malformed or impossible values', () => {
    assert.equal(fromDateTimeLocalValue(''), null);
    assert.equal(fromDateTimeLocalValue('2026-08-01'), null); // no time
    assert.equal(fromDateTimeLocalValue('next tuesday'), null);
    assert.equal(fromDateTimeLocalValue('2026-02-31T10:00'), null); // rolled over
  });
});

describe('formatVisitTime', () => {
  it('produces a human string containing the date', () => {
    const text = formatVisitTime(new Date(2026, 7, 1, 14, 30));
    assert.match(text, /2026/);
    assert.notEqual(text.trim(), '');
  });
});
