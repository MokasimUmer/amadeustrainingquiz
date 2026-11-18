# ─────────────────────────────────────────────
# Stage 1: build
# ─────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install all deps (dev included — needed for the build step)
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build in dependency order
RUN npm run build -w @amadeus/shared
RUN npm run build -w @amadeus/server
RUN npm run build -w @amadeus/web

# ─────────────────────────────────────────────
# Stage 2: lean runtime image
# ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy everything needed to run — built artifacts + node_modules from stage 1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json

# Optional profanity list
COPY profanity.txt* ./

# SQLite volume mount point
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
