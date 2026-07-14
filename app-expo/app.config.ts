import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config, layered over `app.json`.
 *
 * It exists for one reason: the **Android Google Maps key must not be committed.** Android's
 * `react-native-maps` needs a key baked into the manifest, so it has to come from the
 * environment (an EAS secret, or `.env` locally) rather than sit in `app.json` in the repo.
 *
 * It also publishes a single fact to the running app — **whether that key was configured** —
 * because the alternative is worse than no map at all. Android's map view does not fail loudly
 * without a key: it renders a **blank grey square with a draggable pin**, no error, no warning.
 * A user would drag a marker across nothing and submit a location they never saw. So the app
 * needs to know, at runtime, whether a map is actually going to appear.
 *
 * iOS does not need a key — it falls back to Apple Maps — which is why this is published as a
 * fact rather than acted on here. `mapPicker.tsx` decides per platform.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidMapsKey = process.env['GOOGLE_MAPS_ANDROID_KEY']?.trim();
  const androidMapsConfigured = androidMapsKey !== undefined && androidMapsKey !== '';

  return {
    ...config,
    // `ConfigContext` types these as optional; ExpoConfig requires them. They are set in
    // app.json — this keeps the types honest rather than asserting non-null.
    name: config.name ?? 'HomeFix',
    slug: config.slug ?? 'homefix',
    android: {
      ...config.android,
      ...(androidMapsConfigured ? { config: { googleMaps: { apiKey: androidMapsKey } } } : {}),
    },
    extra: {
      ...config.extra,
      androidMapsConfigured,
    },
  };
};
