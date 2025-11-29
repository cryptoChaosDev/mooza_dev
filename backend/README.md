# Mooza Backend

This is the backend API for the Mooza Music Social Network, built with Node.js, Express, and Prisma ORM.

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express
- **ORM**: Prisma 5+
- **Database**: SQLite
- **Authentication**: JWT
- **Language**: TypeScript

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Docker (for containerized development)

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Production
```bash
npm start
```

## Project Structure

```
src/
├── routes/            # API route handlers
├── data/              # Data models and utilities
├── server.ts          # Express server setup
└── index.ts           # Entry point
```

## Database

The backend uses SQLite for development and can be configured to use PostgreSQL for production.

### Prisma Commands

- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:deploy` - Deploy migrations to production

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
DATABASE_URL=file:./dev.db
JWT_SECRET=your-jwt-secret
PORT=4000
NODE_ENV=development
```

## API Endpoints

- `/auth` - Authentication endpoints
- `/profile` - User profile endpoints
- `/categories` - Music categories endpoints
- `/friendships` - Friendships endpoints

## Docker

The backend can be run in a Docker container using the provided Dockerfile:

```bash
docker-compose up
```

## Testing

The backend includes unit tests and integration tests:

```bash
npm test
```