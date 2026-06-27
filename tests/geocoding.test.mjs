import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resultToCoordinateStrings,
  searchAddress,
} from '../app/src/features/location/geocoding.ts';

const SAMPLE = [
  { latitude: 25.033964, longitude: 121.564468, label: 'Taipei 101' },
  { latitude: 25.047924, longitude: 121.517081, label: 'Taipei Main Station' },
];

function geocoderReturning(results) {
  return { geocode: () => Promise.resolve(results) };
}

describe('searchAddress', () => {
  it('returns matches for a valid query', async () => {
    const outcome = await searchAddress(geocoderReturning(SAMPLE), '  Taipei  ');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results.length, 2);
    assert.equal(outcome.results[0].label, 'Taipei 101');
  });

  it('rejects a too-short query without calling the geocoder', async () => {
    let called = false;
    const geocoder = {
      geocode: () => {
        called = true;
        return Promise.resolve(SAMPLE);
      },
    };
    const outcome = await searchAddress(geocoder, 'ab');
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /at least 3/);
    assert.equal(called, false);
  });

  it('reports a friendly message when there are no matches', async () => {
    const outcome = await searchAddress(geocoderReturning([]), 'nowhere place');
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /No matching places/);
  });

  it('maps a provider error to a friendly message', async () => {
    const geocoder = { geocode: () => Promise.reject(new Error('rate limited')) };
    const outcome = await searchAddress(geocoder, 'Taipei');
    assert.equal(outcome.ok, false);
    assert.equal(outcome.message, 'rate limited');
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    const geocoder = { geocode: () => Promise.reject('boom') };
    const outcome = await searchAddress(geocoder, 'Taipei');
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /Could not search/);
  });
});

describe('resultToCoordinateStrings', () => {
  it('formats coordinates to 6 decimal places', () => {
    assert.deepEqual(resultToCoordinateStrings(SAMPLE[0]), {
      latitude: '25.033964',
      longitude: '121.564468',
    });
  });
});
