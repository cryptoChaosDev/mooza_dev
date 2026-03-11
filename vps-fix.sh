#!/bin/bash
# VPS Fix Script - Resolve migration issues and update

set -e  # Exit on error

echo "🔧 Fixing Mooza VPS deployment..."

cd /opt/mooza

# Pull latest code from Git
echo "📥 Pulling latest code from Git..."
git fetch --all
git reset --hard origin/master

# Stop containers
echo "🛑 Stopping containers..."
docker-compose down

# Remove old database volume
echo "🗑️ Removing old database volume..."
docker volume rm mooza_dev_postgres_data 2>/dev/null || true

# Start containers
echo "🚀 Starting containers..."
docker-compose up -d

# Wait for database
echo "⏳ Waiting for database (20 seconds)..."
sleep 20

# Apply all migrations from scratch
echo "📊 Applying database migrations..."
docker-compose exec -T api npx prisma migrate deploy

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
docker-compose exec -T api npx prisma generate

# Restart API to apply changes
echo "🔄 Restarting API..."
docker-compose restart api

# Show status
echo "✅ Checking status..."
docker-compose ps

# Show recent logs
echo "📝 Recent logs:"
docker-compose logs --tail=30 api

echo ""
echo "✅ Fix complete!"
echo "Test with: curl http://147.45.166.246:4000/health"
