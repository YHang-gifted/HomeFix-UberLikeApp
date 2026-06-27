# HomeFix API server image.
#
# The server currently runs TypeScript directly via tsx (no compile step yet),
# so the image installs all dependencies and runs the entrypoint with tsx. A
# future ops slice should add a `tsc` build and switch to a dev-dependency-free
# image (`npm ci --omit=dev`) for a smaller production artifact.
FROM node:20-slim

WORKDIR /app

# Install dependencies first for better layer caching. NODE_ENV is intentionally
# left unset during install so npm keeps tsx (a devDependency the server needs at
# runtime); it is set to production afterwards.
COPY package.json package-lock.json ./
RUN npm ci

ENV NODE_ENV=production

# Only the sources the server actually runs (the Expo app and tests are excluded
# via .dockerignore and the explicit COPY list below).
COPY tsconfig.base.json tsconfig.json ./
COPY shared ./shared
COPY server ./server

# The server reads PORT (default 3000).
EXPOSE 3000

# Run as the unprivileged user shipped with the node image.
USER node

CMD ["npm", "start"]
