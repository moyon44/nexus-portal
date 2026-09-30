import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'portail',
      password: process.env.DB_PASSWORD || 'change-me',
      database: process.env.DB_NAME || 'portail_db',
    },
    migrations: {
      extension: 'ts',
      directory: './migrations',
    },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      extension: 'ts',
      directory: './migrations',
    },
  },
};

export default config;
