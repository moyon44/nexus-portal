import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'portail',
    password: process.env.DB_PASSWORD || 'change-me',
    database: process.env.DB_NAME || 'portail_db',
  },
});

async function init() {
  console.log('Starting database initialization...');

  try {
    // Wait for database to be ready
    let retries = 30;
    while (retries > 0) {
      try {
        await db.raw('SELECT 1');
        console.log('✓ Database connection successful');
        break;
      } catch (error) {
        console.log(`Database not ready yet, retrying... (${retries} attempts left)`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (retries === 0) {
      throw new Error('Could not connect to database after 30 attempts');
    }

    // Run migrations
    console.log('Running migrations...');
    const migrationsRun = await db.migrate.latest({ directory: './src/migrations' });
    console.log(`✓ Migrations completed: ${migrationsRun[1].join(', ')}`);

    console.log('✓ Database initialization complete');
    process.exit(0);
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

init();
