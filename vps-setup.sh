#!/bin/bash
# VPS Setup Script for Mooza Application

set -e  # Exit on error

echo "🚀 Starting Mooza VPS setup..."

# Navigate to project directory
cd /opt/mooza

# Stop and remove old containers
echo "📦 Removing old containers..."
docker-compose down 2>/dev/null || true
docker rm -f mooza-web mooza-api mooza-postgres 2>/dev/null || true

# Clean up volumes
echo "🧹 Cleaning up old volumes..."
docker volume rm mooza_dev_postgres_data 2>/dev/null || true

# Start containers
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Apply database migrations
echo "📊 Applying database migrations..."
docker-compose exec -T api npx prisma migrate deploy

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
docker-compose exec -T api npx prisma generate

# Check container status
echo "✅ Checking container status..."
docker-compose ps

# Show logs
echo "📝 Showing recent logs..."
docker-compose logs --tail=50

echo ""
echo "✅ Setup complete!"
echo ""
echo "📡 API available at: http://147.45.166.246:4000"
echo "🌐 Web available at: http://147.45.166.246:3000"
echo ""
echo "Test API with: curl http://147.45.166.246:4000/health"
