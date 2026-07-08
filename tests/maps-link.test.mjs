import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { googleStaticMapUrl, mapsUrl } from '../app/src/features/location/mapsLink.ts';

describe('mapsUrl', () => {
  it('builds a universal Google Maps search link from coordinates', () => {
    const url = mapsUrl({ latitude: 25.03, longitude: 121.56 });
    assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=25.03%2C121.56');
  });

  it('encodes negative and fractional coordinates', () => {
    const url = mapsUrl({ latitude: -33.8688, longitude: 151.2093 });
    assert.match(url, /query=-33\.8688%2C151\.2093$/);
  });
});

describe('googleStaticMapUrl', () => {
  it('builds a Google Static Maps URL with a centered brand-colored marker and key', () => {
    const url = googleStaticMapUrl({ latitude: 25.03, longitude: 121.56 }, 'test-key');
    assert.ok(url.startsWith('https://maps.googleapis.com/maps/api/staticmap?'));
    assert.match(url, /center=25\.03%2C121\.56/);
    assert.match(url, /markers=color%3A0x167A5A%7C25\.03%2C121\.56/);
    assert.match(url, /size=600x300/);
    assert.match(url, /key=test-key/);
  });
});
