FROM node:22.18-bookworm-slim AS node-base
RUN npm install --global npm@11.14.1

FROM node-base AS web-build
ARG RAID_SIGNAL_RELEASE_TAG
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html overlay.html companion.html signal.html tsconfig*.json vite.config.* ./
COPY contracts ./contracts
COPY src ./src
COPY public ./public
COPY scripts/fetch-release-manifest.mjs ./scripts/fetch-release-manifest.mjs
RUN test -n "$RAID_SIGNAL_RELEASE_TAG" && npm run build:web && node scripts/fetch-release-manifest.mjs "$RAID_SIGNAL_RELEASE_TAG" /app/dist/release.json

FROM node-base AS relay-build
WORKDIR /app/relay
COPY relay/package.json relay/package-lock.json ./
RUN npm ci
COPY relay/tsconfig.server.json ./
COPY relay/src ./src
RUN npm run build:server

FROM node-base
ENV NODE_ENV=production PORT=3000 STATIC_ROOT=/app/web
WORKDIR /app
COPY relay/package.json relay/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=relay-build /app/relay/dist ./dist
COPY --from=web-build /app/dist ./web
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
