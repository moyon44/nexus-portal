import { Knex } from 'knex';

/** First name for the home page greeting ("Bonsoir Alex"). */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('theme_config', 'user_name');
  if (!hasColumn) {
    await knex.schema.alterTable('theme_config', (table) => {
      table.string('user_name', 64).nullable();
    });
    console.log('✓ Added user_name column to theme_config');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('user_name');
  });
}
