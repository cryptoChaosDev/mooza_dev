# Mooza PostgreSQL Setup

This document explains how to configure and set up PostgreSQL for the Mooza application.

## Prerequisites

- Docker and Docker Compose installed
- Existing Mooza application deployment
- Root access to the server

## Setup Process

### 1. Run the Setup Script

The easiest way to configure PostgreSQL is to use the provided setup script:

```bash
# Download the script
curl -fsSL -o fix-postgres-setup.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-postgres-setup.sh

# Make it executable
chmod +x fix-postgres-setup.sh

# Run the script with sudo
sudo ./fix-postgres-setup.sh
```

### 2. Manual Setup Steps

If you prefer to set up PostgreSQL manually, follow these steps:

#### Update Prisma Schema

Ensure your `backend/prisma/schema.prisma` file has the correct datasource configuration:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

#### Configure Environment Variables

Create or update `backend/.env` with PostgreSQL connection details:

```env
DATABASE_URL="postgresql://user:password@db:5432/mooza?schema=public"
PORT=4000
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
```

#### Run Database Migrations

After updating the configuration:

```bash
# Start services
sudo docker compose -f docker-compose.prod.yml up -d

# Wait for services to start
sleep 15

# Run Prisma migrations
sudo docker compose -f docker-compose.prod.yml exec api npx prisma migrate dev --name init

# Generate Prisma client
sudo docker compose -f docker-compose.prod.yml exec api npx prisma generate
```

#### Verify Database Tables

Check that the required tables were created:

```bash
sudo docker compose -f docker-compose.prod.yml exec db psql -U user -d mooza -c "\dt"
```

You should see tables for `User`, `Post`, and `Friendship`.

### 3. Restart Services

After completing the setup, restart your services:

```bash
sudo docker compose -f docker-compose.prod.yml down
sudo docker compose -f docker-compose.prod.yml up -d --build
```

## Troubleshooting

### Common Issues

1. **Permission denied errors**: Make sure you're running the script with `sudo`

2. **Database connection failures**: 
   - Check that the PostgreSQL container is running
   - Verify the database credentials in the `.env` file
   - Ensure the database URL format is correct

3. **Migration errors**:
   - Reset the database: `npx prisma migrate reset --force`
   - Run migrations again: `npx prisma migrate dev --name init`

4. **Tables not appearing**:
   - Check the Prisma schema for correct model definitions
   - Verify the database is using the correct schema

### Checking Service Status

```bash
# Check if containers are running
sudo docker compose -f docker-compose.prod.yml ps

# Check logs for errors
sudo docker compose -f docker-compose.prod.yml logs api
sudo docker compose -f docker-compose.prod.yml logs db
```

## Testing the Setup

After completing the setup, you should be able to:

1. Register new users through the frontend
2. Create posts
3. See posts from friends in the feed
4. Establish friendship connections

Test registration:
```bash
curl -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

If everything is working correctly, you should receive a successful response without any 500 errors.