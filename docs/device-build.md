# Device Build Runbook (iOS / Android)

**This app has never run on a phone.** Until slice 186 it could not even be built for one:
`app-expo/app.json` was still the unmodified `create-expo-app` template — no bundle identifier,
no package name, no config plugins, no EAS project. Everything green in CI told you nothing
about a device, because the four native adapters (`push.ts`, `location.ts`, `imagePicker.ts`,
`mapPicker.tsx`) have no tests and `App.tsx` — the only place the real ones are wired in — is
never rendered under test.

This runbook gets it onto a device. Expect the first build to surface something; that is the
point of doing it.

> **Expo Go will not work here.** Android push was removed from Expo Go in SDK 53, and custom
> native config (Maps keys, Info.plist strings, the URL scheme) is inert in it by definition.
> The path is an **EAS development or preview build**.

## What slice 186 fixed, and what it could not

Fixed in code:

- **iOS would have hard-crashed** on the first location or photo-library call. iOS terminates
  the process the moment a protected API is touched with no usage-description string, and there
  were none. The permission _code_ was correct all along — the config simply did not exist. The
  `expo-location` and `expo-image-picker` plugins now inject the strings.
- **Push could never have worked, on any device, ever.** `getExpoPushTokenAsync()` was called
  with no `projectId`, and `app.json` had no `extra` block, so the library found none from any
  of its three sources and threw every single time. The caller swallowed the error and the
  outcome was discarded. It now passes the id explicitly, says plainly what is missing, and the
  failure is logged instead of vanishing.
- **Android's map picker would have been a blank grey square.** Google Maps renders empty tiles
  with no API key — no error, no warning — so a user would drag a pin across nothing and submit
  a location they never saw. The picker is now offered on Android only when a key is configured
  (iOS falls back to Apple Maps and needs no key).

Still open, and only a real device can settle them:

- **Foreground notifications will not render.** There is no `setNotificationHandler` anywhere.
  A delivered push will not show while the app is open. Add it once push is confirmed working —
  the handler's shape changed in recent SDKs, so it is worth writing against what you observe
  rather than from memory.
- **Hosted checkout does not return to the native app.** `checkout.ts` opens Stripe/PayPal in
  the system browser; the provider's `return_url` is the _web_ app, so the user lands there and
  the native app never learns. The payment still settles (the webhook does that) and shows as
  paid on the next refresh — degraded, not broken. A proper fix needs a deep link handler for
  the `homefix://` scheme.
- **New Architecture is on** (the SDK 56 default). We do **not** set `newArchEnabled` in
  `app.json` — the config schema rejects it as an unknown property (`expo-doctor` fails on it),
  and it is on by default anyway. `react-native-maps` is the component most likely to object to
  the new architecture; if the map misbehaves, turn it off via the **`expo-build-properties`**
  config plugin (`newArchEnabled: false`), not a root field.

## 1. Install the one new dependency

```bash
cd app-expo
npx expo install expo-constants
```

`push.ts` and `mapPicker.tsx` read the app config through it. Use `expo install`, not
`npm install` — it picks the version that matches the SDK.

## 2. Create the EAS project

```bash
npm install -g eas-cli
eas login          # create a free Expo account if you don't have one
cd app-expo
eas init
```

`eas init` writes `extra.eas.projectId` into the app config. **That is the value whose absence
made push impossible** — this step is not bookkeeping, it is the fix.

## 3. The Google Maps Android key

Android needs its own key; iOS does not (Apple Maps).

1. Google Cloud Console → APIs & Services → **Maps SDK for Android** → enable it.
2. Credentials → **Create credentials → API key**.
3. **Restrict it** — an unrestricted Maps key is billable by anyone who finds it, and it _will_
   be found: an Android Maps key is embedded in the app package and is trivially extractable.
   Restrict to **Android apps**, with:

   - package name: `com.homefix.dev` (whatever is in `app.json` at the time)
   - SHA-1 fingerprint: run `eas credentials` after the first build and read it there. EAS
     generates the signing keystore, so this does not exist until then.

   **Chicken and egg:** you cannot restrict the key before the first build produces a
   fingerprint. Create it, build, restrict it, rebuild. Do not leave it unrestricted "for now".

4. Store both Maps keys as **EAS secrets** — they must not go in `eas.json`, which is committed:

```bash
eas secret:create --name GOOGLE_MAPS_ANDROID_KEY --value <key>
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY --value <key>
```

`app.config.ts` reads `GOOGLE_MAPS_ANDROID_KEY` at build time, bakes it into the manifest, and
publishes `extra.androidMapsConfigured` so the app knows at runtime whether a map will actually
appear.

## 4. Build

```bash
cd app-expo
npx expo-doctor                                     # catches config mistakes before a 20-min build
eas build --profile development --platform android
```

Android first: it is faster, needs no Apple Developer account ($99/year), and exercises the
riskier half (push and Maps both behave differently there).

For iOS you need a paid Apple Developer account. `--profile preview` produces an
internal-distribution build that installs without a dev client.

## 5. Install and check the basics before opening the checklist

Install the artifact EAS gives you. Then, in order — each one is a thing that could not have
worked before:

- [ ] The app launches and reaches the login screen.
- [ ] Sign in as a demo user. (If every request fails, `EXPO_PUBLIC_API_BASE_URL` did not make
      it into the build — it is inlined at **build** time, so a rebuild is the only fix.)
- [ ] **Location:** the permission prompt appears with our wording, and "Use my current
      location" fills in coordinates. _(On iOS this is the call that would previously have
      crashed the process outright.)_
- [ ] **Photos:** the permission prompt appears, and a photo can be attached. _(Same.)_
- [ ] **Map picker:** on Android, either a real map appears **or** the "Pick on map" button is
      absent (no key configured). A blank grey map means the key is present but wrong —
      restricted to the wrong package or fingerprint.
- [ ] **Push:** grant the prompt, then check the device log for `[push]`. Silence means it
      registered. `[push] not registered (error) …` now tells you why — that message is new.
      Send a test push from `https://expo.dev/notifications` with the token.

Then run `docs/qa-checklist.md` — the parts automation cannot reach: native modules, real
gestures, offline behavior, accessibility, performance. The **web** smoke and login/create paths
are already covered by the `Web E2E` CI job and do not need re-testing by hand.

## Guardrails

- **Never commit an API key.** `eas.json` is in the repo; keys belong in EAS secrets.
- `EXPO_PUBLIC_*` is inlined at **build** time. Changing one means rebuilding — a restart, a
  reinstall, and an OTA update will all leave the old value in place. This has already caught us
  once on the web deploy.
- The bundle identifier (`com.homefix.dev`) is **temporary**, pending a domain. Changing it
  later is free _until the app is published_ — after that it is a different app, and existing
  installs do not migrate.
