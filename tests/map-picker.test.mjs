import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { initialMapRegion } from '../app/src/features/location/mapPicker.ts';

describe('initialMapRegion', () => {
  it('uses valid form coordinates as the center', () => {
    const region = initialMapRegion('25.047', '121.517');
    assert.equal(region.latitude, 25.047);
    assert.equal(region.longitude, 121.517);
    assert.ok(region.latitudeDelta > 0);
    assert.ok(region.longitudeDelta > 0);
  });

  it('falls back to the default center for empty values', () => {
    const region = initialMapRegion('', '');
    assert.equal(region.latitude, 25.033);
    assert.equal(region.longitude, 121.5654);
  });

  it('falls back to the default center for out-of-range or non-numeric values', () => {
    const region = initialMapRegion('999', 'abc');
    assert.equal(region.latitude, 25.033);
    assert.equal(region.longitude, 121.5654);
  });

  it('keeps a valid axis and defaults only the invalid one', () => {
    const region = initialMapRegion('25.047', '999');
    assert.equal(region.latitude, 25.047);
    assert.equal(region.longitude, 121.5654);
  });
});
