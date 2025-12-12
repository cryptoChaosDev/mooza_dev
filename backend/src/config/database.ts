import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Determine the dialect based on the DATABASE_URL
const databaseUrl = process.env.DATABASE_URL || 'sqlite:./prisma/dev.db';
const dialect = databaseUrl.startsWith('sqlite:') ? 'sqlite' : 'postgres';

const sequelize = new Sequelize(databaseUrl, {
  dialect: dialect as any,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  storage: dialect === 'sqlite' ? databaseUrl.replace('sqlite:', '') : undefined
});

export { sequelize };