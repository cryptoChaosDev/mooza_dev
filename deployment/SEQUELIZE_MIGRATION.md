# Mooza Prisma to Sequelize Migration Guide

This document explains how to migrate the Mooza application from Prisma ORM to Sequelize ORM.

## Why Migrate to Sequelize?

1. **Simpler Setup**: Sequelize doesn't require generating client code like Prisma
2. **More Control**: Direct SQL queries when needed
3. **Mature Ecosystem**: Long-standing ORM with extensive documentation
4. **Better PostgreSQL Support**: Native PostgreSQL features support

## Migration Process

### 1. Run the Migration Script

The easiest way to migrate is to use the provided script:

```bash
# Download the script
curl -fsSL -o migrate-to-sequelize.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/migrate-to-sequelize.sh

# Make it executable
chmod +x migrate-to-sequelize.sh

# Run the script with sudo
sudo ./migrate-to-sequelize.sh
```

### 2. What the Script Does

The migration script performs the following actions:

1. **Removes Prisma dependencies**:
   - Uninstalls `@prisma/client` and `prisma` packages
   - Removes the `prisma` directory

2. **Installs Sequelize dependencies**:
   - Installs `sequelize` and `pg` (PostgreSQL driver)
   - Installs TypeScript definitions

3. **Creates Sequelize models**:
   - User model
   - Profile model
   - Post model
   - Like model
   - Friendship model

4. **Creates database configuration**:
   - Sets up Sequelize connection
   - Configures connection pooling

5. **Updates application code**:
   - Modifies auth routes to use Sequelize
   - Updates server initialization
   - Updates Dockerfile

6. **Restarts services**:
   - Rebuilds and restarts Docker containers

### 3. Manual Migration Steps

If you prefer to migrate manually, follow these steps:

#### Step 1: Remove Prisma

```bash
cd /opt/mooza/backend
npm uninstall @prisma/client prisma
rm -rf prisma
```

#### Step 2: Install Sequelize

```bash
npm install sequelize pg
npm install --save-dev @types/sequelize
```

#### Step 3: Create Models

Create the model files in `backend/src/models/` as shown in the script.

#### Step 4: Create Database Configuration

Create `backend/src/config/database.ts`:

```typescript
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgresql://user:password@db:5432/mooza',
  {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

export { sequelize };
```

#### Step 5: Update Server Initialization

Modify `backend/src/server.ts` to initialize Sequelize:

```typescript
import { sequelize } from "./config/database";

// Initialize database
const initializeDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};
```

#### Step 6: Update Routes

Update your route files to use Sequelize models instead of Prisma client.

#### Step 7: Update Dockerfile

Simplify the Dockerfile by removing Prisma-specific steps:

```dockerfile
# Use Node.js 18 as the base image
FROM node:18-alpine

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 py3-pip make g++

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 4000

# Start the application
CMD ["node", "dist/index.js"]
```

## Testing the Migration

After completing the migration:

1. **Check the logs**:
   ```bash
   sudo docker compose -f docker-compose.prod.yml logs api
   ```

2. **Test registration**:
   ```bash
   curl -X POST http://147.45.166.246/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
   ```

3. **Test login**:
   ```bash
   curl -X POST http://147.45.166.246/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Check that the DATABASE_URL in your .env file is correct
   - Ensure the PostgreSQL container is running
   - Verify network connectivity between containers

2. **Model Synchronization Issues**:
   - Check the Sequelize model definitions
   - Ensure data types match PostgreSQL capabilities
   - Use `sequelize.sync({ force: true })` to recreate tables (will lose data)

3. **Dependency Installation Failures**:
   - Ensure Python and build tools are installed in the Docker container
   - Check npm registry connectivity

### Rolling Back

If you need to roll back to Prisma:

1. Restore the backed up files:
   ```bash
   cd /opt/mooza/backend
   mv src/routes/auth.ts.prismabackup src/routes/auth.ts
   mv src/server.ts.prismabackup src/server.ts
   mv Dockerfile.prismabackup Dockerfile
   ```

2. Reinstall Prisma:
   ```bash
   npm install @prisma/client prisma
   ```

3. Restore the Prisma schema and migrations

## Benefits of Sequelize

1. **No Code Generation**: Unlike Prisma, Sequelize doesn't require generating client code
2. **Flexible Queries**: Supports both ORM methods and raw SQL queries
3. **Active Record Pattern**: More familiar to developers coming from other frameworks
4. **Better Debugging**: Easier to debug SQL queries
5. **Established Community**: Large community and extensive documentation

## Conclusion

The migration from Prisma to Sequelize should resolve the database issues you were experiencing while providing a robust ORM solution for your application. Sequelize's more traditional approach to ORM may be easier to work with and debug in the long run.