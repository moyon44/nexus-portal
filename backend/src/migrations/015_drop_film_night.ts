import { Knex } from 'knex';

/** Film night and the chat were removed (2026-10-06): film night's column, events and badge, and the chat's disk scans go too. */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('pet', 'cine')) await knex.schema.alterTable('pet', (t) => t.dropColumn('cine'));
  await knex('pet_events').where({ kind: 'cine' }).delete();
  await knex('pet_events').where({ kind: 'badge' }).whereRaw(`meta->>'badge' = 'cine_night'`).delete();
  await knex('pet_badges').where({ key: 'cine_night' }).delete();
  await knex.schema.dropTableIfExists('disk_scans');
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('pet', 'cine'))) await knex.schema.alterTable('pet', (t) => t.jsonb('cine').notNullable().defaultTo('{}'));
}
