FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=packages/web --workspace=packages/shared --include-workspace-root

# Build shared
FROM deps AS build-shared
COPY packages/shared/ packages/shared/
RUN npm run build --workspace=packages/shared 2>/dev/null || true

# Build Web
FROM deps AS build
COPY --from=build-shared /app/packages/shared/ packages/shared/
COPY packages/web/ packages/web/
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace=packages/web

# Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build /app/packages/web/public packages/web/public
COPY --from=build --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/packages/web/.next/static packages/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "packages/web/server.js"]
