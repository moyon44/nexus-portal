import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add weather configuration columns to theme_config table
  await knex.schema.alterTable('theme_config', (table) => {
    table.string('weather_city').notNullable().defaultTo('Paris');
    table.string('weather_unit').notNullable().defaultTo('metric'); // metric or imperial
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove weather configuration columns
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('weather_city');
    table.dropColumn('weather_unit');
  });
}
