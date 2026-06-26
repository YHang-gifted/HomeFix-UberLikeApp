import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fetchCurrentLocation,
  toCoordinateStrings,
} from '../app/src/features/location/currentLocation.ts';

describe('toCoordinateStrings', () => {
  it('formats coordinates to six decimal places', () => {
    assert.deepEqual(toCoordinateStrings({ latitude: 25.033964, longitude: 121.564468 }), {
      latitude: '25.033964',
      longitude: '121.564468',
    });
  });

  it('pads short decimals to six places', () => {
    assert.deepEqual(toCoordinateStrings({ latitude: 25, longitude: -0.5 }), {
      latitude: '25.000000',
      longitude: '-0.500000',
    });
  });
});

describe('fetchCurrentLocation', () => {
  it('returns formatted coordinate strings on success', async () => {
    const provider = {
      getCurrentPosition: () => Promise.resolve({ latitude: 1.234567, longitude: 2.345678 }),
    };
    const outcome = await fetchCurrentLocation(provider);
    assert.deepEqual(outcome, { ok: true, latitude: '1.234567', longitude: '2.345678' });
  });

  it("surfaces the provider's error message", async () => {
    const provider = {
      getCurrentPosition: () => Promise.reject(new Error('Location permission denied')),
    };
    const outcome = await fetchCurrentLocation(provider);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.message, 'Location permission denied');
  });

  it('falls back to a generic message for an unhelpful error', async () => {
    const provider = {
      getCurrentPosition: () => Promise.reject(new Error('')),
    };
    const outcome = await fetchCurrentLocation(provider);
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /enter it manually/i);
  });
});
