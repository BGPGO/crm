FROM node:20-alpine
WORKDIR /app

# Copy only package files for dependency install
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/

# Install ONLY api and shared workspaces (not web/playwright)
RUN npm ci --workspace=packages/api --workspace=packages/shared --include-workspace-root

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

# Generate Prisma client and build
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma
RUN cd packages/shared && npx tsc || true
RUN cd packages/api && npx tsc

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/packages/api
CMD ["node", "dist/index.js"]
