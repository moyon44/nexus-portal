import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCustomPosition = await knex.schema.hasColumn('theme_config', 'system_stats_custom_position');

  if (!hasCustomPosition) {
    await knex.schema.alterTable('theme_config', (table) => {
      table.text('system_stats_custom_position').nullable();
    });
    console.log('✓ Added system_stats_custom_position column to theme_config');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('system_stats_custom_position');
  });
  console.log('✓ Removed system_stats_custom_position column from theme_config');
}
