# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
# Install OpenSSL for Prisma
RUN apk add --no-cache openssl
COPY package.json ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
# Install OpenSSL for Prisma
RUN apk add --no-cache openssl
COPY package.json ./
RUN npm ci || npm install
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Install OpenSSL for Prisma
RUN apk add --no-cache openssl
# Install production dependencies
COPY package.json ./
RUN npm ci --only=production || npm install --only=production
# Generate Prisma client in runner stage
COPY prisma ./prisma
RUN npx prisma generate
# Copy built files
COPY --from=builder /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/index.js"]