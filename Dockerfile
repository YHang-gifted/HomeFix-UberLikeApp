# HomeFix API server image (multi-stage).
#
# Stage 1 compiles the TypeScript sources to plain JavaScript with `tsc`
# (tsconfig.build.json). Stage 2 is a dev-dependency-free runtime that ships only
# the compiled `dist/` and production dependencies, so neither tsx nor the
# TypeScript toolchain is present in the deployed image.

# --- Build stage: full dependencies + compile to dist/ ---
FROM node:20-slim AS build

WORKDIR /app

# Install all dependencies (including devDependencies such as typescript) for the
# build. NODE_ENV stays unset here so npm keeps devDependencies.
COPY package.json package-lock.json ./
RUN npm ci

# Only the sources the build needs (the Expo app and tests are excluded via
# .dockerignore and the explicit COPY list below).
COPY tsconfig.base.json tsconfig.build.json ./
COPY shared ./shared
COPY server ./server

RUN npm run build

# --- Runtime stage: production dependencies + compiled output only ---
FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only (no tsx, no typescript).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the compiled JavaScript emitted by the build stage.
COPY --from=build /app/dist ./dist

# The server reads PORT (default 3000).
EXPOSE 3000

# Run as the unprivileged user shipped with the node image.
USER node

CMD ["node", "dist/server/src/server.js"]
