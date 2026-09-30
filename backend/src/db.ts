import knex, { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const db: Knex = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'portail',
    password: process.env.DB_PASSWORD || 'change-me',
    database: process.env.DB_NAME || 'portail_db',
  },
  pool: { min: 2, max: 10 },
});

export default db;
