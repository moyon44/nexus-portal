import { Knex } from 'knex';

/**
 * Home Assistant widgets (routes/ha.ts): the "Maison" page and the home
 * page's Maison section. kind: value (big value + 24 h curve), room (several
 * sensors of one room), status (gauges and states), control (buttons).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('ha_widgets'))) {
    await knex.schema.createTable('ha_widgets', (table) => {
      table.increments('id').primary();
      table.string('kind', 16).notNullable();
      table.string('title', 80).notNullable().defaultTo('');
      table.jsonb('entities').notNullable().defaultTo('[]');
      table.boolean('on_home').notNullable().defaultTo(true);
      table.string('size', 8).notNullable().defaultTo('small');
      table.integer('position').notNullable().defaultTo(0);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    console.log('✓ ha_widgets ready');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ha_widgets');
}
