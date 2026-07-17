# HomeFix image (multi-stage).
#
# Stage 1 (build)    compiles the TypeScript server to plain JavaScript.
# Stage 2 (webbuild) exports the Expo web bundle so the API can serve it
#                    same-origin (app-expo/dist).
# Stage 3 (runtime)  is a dev-dependency-free image that ships only the compiled
#                    server, the web bundle, and production dependencies — neither
#                    tsx, the TypeScript toolchain, nor the Expo build tooling is
#                    present in the deployed image.

# --- Build stage: full dependencies + compile the server to dist/ ---
FROM node:22-slim AS build

WORKDIR /app

# Install all dependencies (including devDependencies such as typescript) for the
# build. NODE_ENV stays unset here so npm keeps devDependencies.
COPY package.json package-lock.json ./
RUN npm ci

# Only the sources the server build needs.
COPY tsconfig.base.json tsconfig.build.json ./
COPY shared ./shared
COPY server ./server

RUN npm run build

# --- Web build stage: export the Expo web bundle to app-expo/dist ---
FROM node:22-slim AS webbuild

WORKDIR /app

# The web app calls the API at this absolute origin, inlined at build time so the
# browser and the WebSocket both target the deployed host. It is REQUIRED for a
# same-origin deploy — build with:
#   docker build --build-arg EXPO_PUBLIC_API_BASE_URL=https://your-host .
ARG EXPO_PUBLIC_API_BASE_URL
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}
RUN test -n "$EXPO_PUBLIC_API_BASE_URL" || ( \
  echo "ERROR: build-arg EXPO_PUBLIC_API_BASE_URL is required (the absolute API origin the web app calls)." >&2; \
  exit 1 )

# OPTIONAL: a Google Static Maps API key, inlined at build time so the Location
# section can render a small map thumbnail. Leave it unset and the UI falls back to
# the address/coordinates text + "Open in Maps" link (no broken image). This key is
# baked into the public web bundle, so it MUST be HTTP-referrer restricted to the
# web origin and limited to the Static Maps API in Google Cloud. Build with:
#   docker build --build-arg EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY=your-key .
ARG EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY
ENV EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY=${EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY}

# OPTIONAL: a Google Maps JavaScript API key, inlined at build time so the web
# "Pick on map" flow (drag a pin to set the exact location) works. Leave it unset
# and the button is simply hidden on web (native uses react-native-maps regardless).
# Same lockdown as the static key (HTTP-referrer restricted to the web origin); the
# key must have the "Maps JavaScript API" enabled. Build with:
#   docker build --build-arg EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY=your-key .
ARG EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY
ENV EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY=${EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY}

# OPTIONAL: set to `true` to offer PayPal as a checkout method on the app (only when the
# server has PayPal configured). Unset → only the default card provider is offered.
ARG EXPO_PUBLIC_PAYPAL_ENABLED
ENV EXPO_PUBLIC_PAYPAL_ENABLED=${EXPO_PUBLIC_PAYPAL_ENABLED}

# OPTIONAL: set to `true` to show the worker "Set up payouts" (Stripe Connect onboarding)
# button — only when the server has Connect configured. Unset → the button is hidden.
ARG EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED
ENV EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED=${EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED}

# OPTIONAL: the Stripe PUBLISHABLE key (`pk_…`), inlined at build time so the web app shows the
# Uber-style saved-card UI ("Payment methods" → Add a card, and "Pay with a saved card" on a
# request). Unset → the saved-card UI is hidden and the web app falls back to hosted checkout only.
# A publishable key is designed to be public, so it is safe to bake into the web bundle (unlike the
# secret `sk_…`, which stays server-side only). Build with:
#   docker build --build-arg EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_... .
ARG EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY}

# Install app-expo dependencies first so this layer caches unless the lockfile
# changes. (node_modules is excluded by .dockerignore, so the later source copy
# never clobbers it.)
COPY app-expo/package.json app-expo/package-lock.json ./app-expo/
RUN cd app-expo && npm ci

# The web export mirrors ../app and ../shared into the Expo project, so both must
# sit alongside app-expo.
COPY shared ./shared
COPY app ./app
COPY app-expo ./app-expo

RUN cd app-expo && npm run export:web

# --- Runtime stage: production dependencies + compiled server + web bundle ---
FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only (no tsx, no typescript, no Expo tooling).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled server and the exported web bundle.
COPY --from=build /app/dist ./dist
COPY --from=webbuild /app/app-expo/dist ./app-expo/dist

# Serve the web app same-origin with the API (see server/src/middlewares/webApp.ts).
ENV WEB_DIST_DIR=/app/app-expo/dist

# The server reads PORT (default 3000).
EXPOSE 3000

# Run as the unprivileged user shipped with the node image.
USER node

CMD ["node", "dist/server/src/server.js"]
