import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add system stats columns to theme_config table
  const hasShowSystemStats = await knex.schema.hasColumn('theme_config', 'show_system_stats');
  const hasSystemStatsPosition = await knex.schema.hasColumn('theme_config', 'system_stats_position');

  if (!hasShowSystemStats || !hasSystemStatsPosition) {
    await knex.schema.alterTable('theme_config', (table) => {
      if (!hasShowSystemStats) {
        table.boolean('show_system_stats').defaultTo(true);
      }
      if (!hasSystemStatsPosition) {
        table.string('system_stats_position').defaultTo('top-right');
      }
    });
    console.log('✓ Added system stats columns to theme_config');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert: Remove system stats columns
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('show_system_stats');
    table.dropColumn('system_stats_position');
  });
  console.log('✓ Removed system stats columns from theme_config');
}
