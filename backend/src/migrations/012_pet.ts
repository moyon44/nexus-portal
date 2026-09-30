import { Knex } from 'knex';

/** The portal's creature (sidebar mark): name, birth, experience. One row. */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('pet'))) {
    await knex.schema.createTable('pet', (table) => {
      table.integer('id').primary();
      table.string('name', 32).notNullable().defaultTo('Nexy');
      table.timestamp('born_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.integer('xp').notNullable().defaultTo(40);
      table.timestamp('last_tick', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.date('pets_day').nullable();
      table.integer('pets_today').notNullable().defaultTo(0);
      table.integer('best_streak_h').notNullable().defaultTo(0);
      table.integer('streak_h').notNullable().defaultTo(0);
    });
    await knex('pet').insert({ id: 1 });
    console.log('✓ pet ready');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pet');
}
