import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Determine the dialect based on the DATABASE_URL
const databaseUrl = process.env.DATABASE_URL || 'sqlite:./dev.db';

// Extract dialect from DATABASE_URL
let dialect: 'sqlite' | 'postgres' | 'mysql' | 'mssql' = 'postgres';
if (databaseUrl.includes('sqlite') || databaseUrl.includes('file:')) {
  dialect = 'sqlite';
} else if (databaseUrl.includes('postgres') || databaseUrl.includes('postgresql')) {
  dialect = 'postgres';
} else if (databaseUrl.includes('mysql')) {
  dialect = 'mysql';
} else if (databaseUrl.includes('mssql') || databaseUrl.includes('sqlserver')) {
  dialect = 'mssql';
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: dialect as any,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  storage: dialect === 'sqlite' ? databaseUrl.replace(/^(sqlite:|file:)/, '') : undefined
});

export { sequelize };