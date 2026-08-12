FROM node:22-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html overlay.html companion.html signal.html tsconfig*.json vite.config.* ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim AS relay-build
WORKDIR /app/relay
COPY relay/package.json relay/package-lock.json ./
RUN npm ci
COPY relay/tsconfig.server.json ./
COPY relay/src ./src
RUN npm run build:server

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 STATIC_ROOT=/app/web RELEASE_ROOT=/app/releases
WORKDIR /app
COPY relay/package.json relay/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=relay-build /app/relay/dist ./dist
COPY --from=web-build /app/dist ./web
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
