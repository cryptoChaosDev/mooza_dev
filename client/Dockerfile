# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build argument
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config for SPA routing + OG bot proxy
RUN printf 'map $http_user_agent $is_bot {\n\
    default "";\n\
    "~*(bot|crawler|spider|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|slackbot|discordbot|vkShare)" "1";\n\
}\n\
server {\n\
    listen 3000;\n\
    location ~ ^/profile/([a-f0-9-]+)$ {\n\
        set $uid $1;\n\
        set $serve_og "";\n\
        if ($is_bot) { set $serve_og "1"; }\n\
        if ($serve_og = "1") {\n\
            proxy_pass http://mooza-api:4000/api/og/profile/$uid;\n\
            proxy_set_header Host $host;\n\
            break;\n\
        }\n\
        root /usr/share/nginx/html;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
