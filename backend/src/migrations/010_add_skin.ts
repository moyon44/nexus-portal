import { Knex } from 'knex';

/** Visual style of the portal: 'default' or 'paper'. */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('theme_config', 'skin'))) {
    await knex.schema.alterTable('theme_config', (table) => {
      table.string('skin', 32).notNullable().defaultTo('default');
    });
    console.log('✓ Added skin column to theme_config');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('skin');
  });
}
