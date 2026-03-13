FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=packages/api --workspace=packages/shared --include-workspace-root

# Build shared
FROM deps AS build-shared
COPY packages/shared/ packages/shared/
RUN npm run build --workspace=packages/shared 2>/dev/null || true

# Build API
FROM deps AS build
COPY --from=build-shared /app/packages/shared/ packages/shared/
COPY packages/api/ packages/api/
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma
RUN npm run build --workspace=packages/api

# Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/api/dist/ packages/api/dist/
COPY --from=build /app/packages/api/prisma/ packages/api/prisma/
COPY --from=build /app/packages/api/node_modules/ packages/api/node_modules/
COPY --from=build /app/packages/api/package.json packages/api/
COPY --from=build /app/packages/shared/ packages/shared/
COPY --from=build /app/package.json ./

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --schema=packages/api/prisma/schema.prisma --accept-data-loss && node packages/api/dist/index.js"]
