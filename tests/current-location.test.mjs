import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fetchCurrentLocation,
  resolveDevicePosition,
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

describe('resolveDevicePosition', () => {
  const coords = { latitude: 1.5, longitude: 2.5 };

  it('throws a friendly permission error when permission is denied', async () => {
    const source = {
      requestPermission: () => Promise.resolve(false),
      getLastKnownPosition: () => Promise.resolve(null),
      getCurrentPosition: () => Promise.resolve(coords),
    };
    await assert.rejects(resolveDevicePosition(source), /permission denied/i);
  });

  it('returns an instant last-known fix without taking a fresh read', async () => {
    let freshCalled = false;
    const source = {
      requestPermission: () => Promise.resolve(true),
      getLastKnownPosition: () => Promise.resolve(coords),
      getCurrentPosition: () => {
        freshCalled = true;
        return Promise.resolve({ latitude: 9, longitude: 9 });
      },
    };
    assert.deepEqual(await resolveDevicePosition(source), coords);
    assert.equal(freshCalled, false);
  });

  it('falls back to a fresh read when there is no last-known fix', async () => {
    const source = {
      requestPermission: () => Promise.resolve(true),
      getLastKnownPosition: () => Promise.resolve(null),
      getCurrentPosition: () => Promise.resolve(coords),
    };
    assert.deepEqual(await resolveDevicePosition(source), coords);
  });

  it('times out instead of hanging when the fresh read never settles', async () => {
    const source = {
      requestPermission: () => Promise.resolve(true),
      getLastKnownPosition: () => Promise.resolve(null),
      // Never settles — the old code hung here forever; the timeout must reject.
      getCurrentPosition: () => new Promise(() => {}),
    };
    await assert.rejects(resolveDevicePosition(source, 10), /could not get your location in time/i);
  });
});
