import { normalizeApiBaseUrl } from './config';

describe('normalizeApiBaseUrl', () => {
  it('falls back to the local dev default when unset or blank', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('http://localhost:3000');
    expect(normalizeApiBaseUrl('')).toBe('http://localhost:3000');
    expect(normalizeApiBaseUrl('   ')).toBe('http://localhost:3000');
  });

  it('prepends https:// to a bare domain (the Railway deploy footgun)', () => {
    expect(normalizeApiBaseUrl('homefix-uberlikeapp-production.up.railway.app')).toBe(
      'https://homefix-uberlikeapp-production.up.railway.app',
    );
  });

  it('keeps an explicit http/https scheme', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeApiBaseUrl('https://api.example.com')).toBe('https://api.example.com');
  });

  it('drops a trailing slash', () => {
    expect(normalizeApiBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(normalizeApiBaseUrl('api.example.com/')).toBe('https://api.example.com');
  });
});
