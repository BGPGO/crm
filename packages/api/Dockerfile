FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=packages/api --workspace=packages/shared --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

RUN npx prisma generate --schema=packages/api/prisma/schema.prisma
RUN cd packages/shared && npx tsc || true
RUN cd packages/api && npx tsc

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/api/dist/ packages/api/dist/
COPY --from=build /app/packages/api/prisma/ packages/api/prisma/
COPY --from=build /app/packages/api/node_modules/ packages/api/node_modules/
COPY --from=build /app/packages/api/package.json packages/api/
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/packages/api
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss 2>&1; node dist/index.js"]
