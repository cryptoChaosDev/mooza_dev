# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm ci || npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Install production dependencies
COPY package.json ./
RUN npm ci --only=production || npm install --only=production
# Copy built files
COPY --from=builder /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/index.js"]