# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build argument
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
RUN echo 'server { \
    listen 3000; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
