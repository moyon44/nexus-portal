import { Knex } from 'knex';

/**
 * - health_daily: one row per service and day (Europe/Paris), rolled up from
 *   health_samples before they expire after 7 days, so monthly recaps
 *   ("Nexus Wrapped") keep uptime and outages.
 * - custom_skins: styles made in the Studio (config = JSON of the controls).
 * - theme_config.skin: room for 'custom:<uuid>'.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('health_daily'))) {
    await knex.schema.createTable('health_daily', (table) => {
      table.uuid('service_id').notNullable();
      table.date('day').notNullable();
      table.integer('samples').notNullable();
      table.integer('up_samples').notNullable();
      table.integer('outages').notNullable().defaultTo(0);
      table.integer('longest_down_s').notNullable().defaultTo(0);
      table.primary(['service_id', 'day']);
      table.index(['day']);
    });
  }
  if (!(await knex.schema.hasTable('custom_skins'))) {
    await knex.schema.createTable('custom_skins', (table) => {
      table.uuid('id').primary();
      table.string('name', 64).notNullable();
      table.jsonb('config').notNullable();
      table.timestamps(true, true);
    });
  }
  await knex.schema.alterTable('theme_config', (table) => {
    table.string('skin', 64).notNullable().defaultTo('default').alter();
  });
  console.log('✓ health_daily, custom_skins ready');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('health_daily');
  await knex.schema.dropTableIfExists('custom_skins');
}
