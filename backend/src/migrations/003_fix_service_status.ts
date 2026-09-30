import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Update all services with status 'unknown' to 'online'
  await knex('services')
    .where('status', 'unknown')
    .update({ status: 'online' });

  // Change the default status from 'unknown' to 'online'
  await knex.schema.alterTable('services', (table) => {
    table.string('status').notNullable().defaultTo('online').alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revert back to 'unknown' as default
  await knex.schema.alterTable('services', (table) => {
    table.string('status').notNullable().defaultTo('unknown').alter();
  });

  // Revert services back to 'unknown' if they were 'online'
  await knex('services')
    .where('status', 'online')
    .update({ status: 'unknown' });
}
