# ─────────────────────────────────────────────
# Stage 1: build
# ─────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy manifests first so the layer is cached when only source changes
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install all deps (including devDependencies needed for build)
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build shared types, then server, then web
RUN npm run build -w @amadeus/shared
RUN npm run build -w @amadeus/server
RUN npm run build -w @amadeus/web

# ─────────────────────────────────────────────
# Stage 2: production image
# ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy the whole repo so workspace resolution works; devDeps were not installed
# in production but we need package.json files for workspace linking.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
# Web is served as static files by the Express server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json

# Install production deps only
RUN npm ci --omit=dev --ignore-scripts

# Optional: profanity list
COPY profanity.txt* ./

# Persistent volume mount point for SQLite
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

# The server serves apps/web/dist as static files
CMD ["node", "apps/server/dist/index.js"]
