FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=packages/api --workspace=packages/shared --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

RUN npx prisma generate --schema=packages/api/prisma/schema.prisma
RUN npm run build --workspace=packages/shared 2>/dev/null || true
RUN npm run build --workspace=packages/api

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --schema=packages/api/prisma/schema.prisma --accept-data-loss && node packages/api/dist/index.js"]
