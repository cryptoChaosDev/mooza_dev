#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Mooza VPS Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker не установлен!${NC}"
    echo "Запустите сначала: ./setup-vps.sh"
    exit 1
fi

# Проверка наличия Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose не установлен!${NC}"
    echo "Запустите сначала: ./setup-vps.sh"
    exit 1
fi

# Определяем команду docker compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Запрос IP или домена
echo -e "${YELLOW}Введите IP адрес или домен вашего сервера:${NC}"
echo -e "${YELLOW}Примеры: 123.45.67.89 или mooza.ru${NC}"
read -p "> " SERVER_HOST

if [ -z "$SERVER_HOST" ]; then
    echo -e "${RED}❌ IP или домен не указан!${NC}"
    exit 1
fi

# Определяем протокол (по умолчанию http)
echo -e "${YELLOW}Используется ли HTTPS? (y/n, по умолчанию n):${NC}"
read -p "> " USE_HTTPS

if [ "$USE_HTTPS" = "y" ] || [ "$USE_HTTPS" = "Y" ]; then
    PROTOCOL="https"
    API_URL="https://${SERVER_HOST}"
else
    PROTOCOL="http"
    API_URL="http://${SERVER_HOST}:4000"
fi

echo -e "${GREEN}✓ API URL: ${API_URL}${NC}"

# Генерация или загрузка существующих secrets
if [ -f .env ]; then
    echo -e "${YELLOW}Загрузка существующих secrets...${NC}"
    JWT_SECRET=$(grep JWT_SECRET .env | cut -d '=' -f2)
    POSTGRES_PASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d '=' -f2)
    if [ -z "$JWT_SECRET" ]; then
        JWT_SECRET=$(openssl rand -hex 32)
    fi
    if [ -z "$POSTGRES_PASSWORD" ]; then
        POSTGRES_PASSWORD=$(openssl rand -hex 16)
    fi
else
    echo -e "${YELLOW}Генерация новых secrets...${NC}"
    JWT_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
fi

# Создание .env файла
echo -e "${YELLOW}Создание .env файла...${NC}"
cat > .env << EOF
JWT_SECRET=${JWT_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
API_URL=${API_URL}
EOF

echo -e "${GREEN}✓ .env файл создан${NC}"

# Создание временного docker-compose с подстановкой переменных
echo -e "${YELLOW}Подготовка конфигурации Docker Compose...${NC}"

# Читаем пароль из .env
POSTGRES_PASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d '=' -f2)

# Создаем актуальный docker-compose.prod.yml
cat > docker-compose.prod.yml << EOF
services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: mooza-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: mooza
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: mooza_db
    # ВАЖНО: Убираем проброс портов наружу!
    expose:
      - "5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - mooza-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mooza -d mooza_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Backend API
  api:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: mooza-api
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://mooza:${POSTGRES_PASSWORD}@postgres:5432/mooza_db
      JWT_SECRET: ${JWT_SECRET}
      ALLOWED_ORIGINS: ${API_URL},https://www.${SERVER_HOST}
    volumes:
      - ./server/uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - mooza-network
    command: sh -c "npx prisma migrate deploy && npm start"

  # Frontend Web App
  web:
    build:
      context: ./client
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=${API_URL}
    container_name: mooza-web
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=${API_URL}
    depends_on:
      - api
    networks:
      - mooza-network

volumes:
  postgres_data:
    driver: local

networks:
  mooza-network:
    driver: bridge
EOF

echo -e "${GREEN}✓ Конфигурация подготовлена${NC}"

# Обновляем Dockerfile клиента для поддержки build args
echo -e "${YELLOW}Обновление Dockerfile клиента...${NC}"
cat > client/Dockerfile << 'EOF'
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
EOF

echo -e "${GREEN}✓ Dockerfile обновлен${NC}"

# Остановка старых контейнеров
echo -e "${YELLOW}Остановка старых контейнеров...${NC}"
$DOCKER_COMPOSE down 2>/dev/null || true
echo -e "${GREEN}✓ Старые контейнеры остановлены${NC}"

# Сборка и запуск
echo -e "${YELLOW}Сборка и запуск контейнеров (это может занять несколько минут)...${NC}"
$DOCKER_COMPOSE -f docker-compose.prod.yml up -d --build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Контейнеры успешно запущены!${NC}"
else
    echo -e "${RED}❌ Ошибка при запуске контейнеров${NC}"
    echo -e "${YELLOW}Проверьте логи: $DOCKER_COMPOSE -f docker-compose.prod.yml logs${NC}"
    exit 1
fi

# Ожидание запуска сервисов
echo -e "${YELLOW}Ожидание запуска сервисов...${NC}"
sleep 10

# Проверка статуса контейнеров
echo -e "${YELLOW}Проверка статуса контейнеров...${NC}"
docker ps --filter "name=mooza" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Проверка health check API
echo -e "${YELLOW}Проверка API...${NC}"
sleep 5
API_HEALTH=$(curl -s http://localhost:4000/health 2>/dev/null)

if [ ! -z "$API_HEALTH" ]; then
    echo -e "${GREEN}✓ API работает: $API_HEALTH${NC}"
else
    echo -e "${RED}⚠️  API не отвечает. Проверьте логи:${NC}"
    echo -e "${YELLOW}   $DOCKER_COMPOSE -f docker-compose.prod.yml logs api${NC}"
fi

# Показать логи последних запусков
echo ""
echo -e "${YELLOW}Последние логи (нажмите Ctrl+C для выхода):${NC}"
echo ""
$DOCKER_COMPOSE -f docker-compose.prod.yml logs --tail=50

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Развертывание завершено!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "📱 Веб-приложение: ${GREEN}${PROTOCOL}://${SERVER_HOST}:3000${NC}"
echo -e "🚀 API: ${GREEN}${API_URL}${NC}"
echo -e "🔐 JWT Secret сохранен в ${GREEN}.env${NC}"
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo -e "  Логи всех сервисов: ${GREEN}$DOCKER_COMPOSE -f docker-compose.prod.yml logs -f${NC}"
echo -e "  Логи API: ${GREEN}$DOCKER_COMPOSE -f docker-compose.prod.yml logs -f api${NC}"
echo -e "  Перезапуск: ${GREEN}$DOCKER_COMPOSE -f docker-compose.prod.yml restart${NC}"
echo -e "  Остановка: ${GREEN}$DOCKER_COMPOSE -f docker-compose.prod.yml down${NC}"
echo ""
echo -e "${YELLOW}⚠️  Рекомендации для production:${NC}"
echo -e "  1. Настройте HTTPS: ${GREEN}sudo ./https-setup.sh${NC}"
echo -e "  2. Настройте файрвол (UFW): ${GREEN}sudo ./setup-vps.sh${NC}"
echo -e "  3. Настройте регулярные бэкапы БД"
echo ""
