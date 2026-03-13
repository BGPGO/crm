FROM node:20-alpine
WORKDIR /app

# Copy everything
COPY . .

# Install all dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma

# Build shared and API
RUN cd packages/shared && npx tsc || true
RUN cd packages/api && npx tsc

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "cd /app && npx prisma db push --schema=packages/api/prisma/schema.prisma --accept-data-loss && node packages/api/dist/index.js"]
