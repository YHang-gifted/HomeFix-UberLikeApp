import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { initialMapRegion } from '../app/src/features/location/mapPicker.ts';

describe('initialMapRegion', () => {
  it('uses valid form coordinates as the center', () => {
    const region = initialMapRegion('40.7128', '-74.006');
    assert.equal(region.latitude, 40.7128);
    assert.equal(region.longitude, -74.006);
    assert.ok(region.latitudeDelta > 0);
    assert.ok(region.longitudeDelta > 0);
  });

  it('falls back to the default center for empty values', () => {
    const region = initialMapRegion('', '');
    assert.equal(region.latitude, 39.8283);
    assert.equal(region.longitude, -98.5795);
  });

  it('falls back to the default center for out-of-range or non-numeric values', () => {
    const region = initialMapRegion('999', 'abc');
    assert.equal(region.latitude, 39.8283);
    assert.equal(region.longitude, -98.5795);
  });

  it('keeps a valid axis and defaults only the invalid one', () => {
    const region = initialMapRegion('40.7128', '999');
    assert.equal(region.latitude, 40.7128);
    assert.equal(region.longitude, -98.5795);
  });
});
