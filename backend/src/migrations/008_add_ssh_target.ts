import { Knex } from 'knex';

/** SSH target for the "SSH" actions (e.g. root@192.168.1.10). */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('theme_config', 'ssh_target');
  if (!hasColumn) {
    await knex.schema.alterTable('theme_config', (table) => {
      table.string('ssh_target', 255).nullable();
    });
    console.log('✓ Added ssh_target column to theme_config');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('ssh_target');
  });
}
