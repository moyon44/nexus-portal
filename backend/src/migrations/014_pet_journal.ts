import { Knex } from 'knex';

/**
 * The creature's health book and trophies (services/pet.ts):
 *  - pet_events: its life story (sick, healed, meals, baths, evolutions,
 *    badges, films watched, film nights);
 *  - pet_badges: unlocked achievements;
 *  - pet.accessory: what it wears (unlocked by badges);
 *  - pet.pets_total: every caress, for the "Câlin" badge;
 *  - disk_scans: daily folder sizes on the media disk, for "what grows".
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('pet_events'))) {
    await knex.schema.createTable('pet_events', (table) => {
      table.increments('id').primary();
      table.timestamp('at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.string('kind', 16).notNullable();
      table.string('title', 160).notNullable();
      table.string('detail', 300).nullable();
      table.jsonb('meta').notNullable().defaultTo('{}');
      table.index(['at']);
      table.index(['kind']);
    });
  }
  if (!(await knex.schema.hasTable('pet_badges'))) {
    await knex.schema.createTable('pet_badges', (table) => {
      table.string('key', 32).primary();
      table.timestamp('unlocked_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
  if (!(await knex.schema.hasTable('disk_scans'))) {
    await knex.schema.createTable('disk_scans', (table) => {
      table.date('day').notNullable();
      table.string('path', 300).notNullable();
      table.bigInteger('bytes').notNullable();
      table.primary(['day', 'path']);
    });
  }
  const has = (c: string) => knex.schema.hasColumn('pet', c);
  if (!(await has('accessory'))) await knex.schema.alterTable('pet', (t) => t.string('accessory', 16).nullable());
  if (!(await has('cine'))) await knex.schema.alterTable('pet', (t) => t.jsonb('cine').notNullable().defaultTo('{}'));
  if (!(await has('pets_total'))) await knex.schema.alterTable('pet', (t) => t.integer('pets_total').notNullable().defaultTo(0));

  // The story starts at birth; it lived through the Nextcloud 34 → 35 breakage (2026-09-27 → 30).
  const pet = await knex('pet').where('id', 1).first();
  if (pet && !(await knex('pet_events').first())) {
    await knex('pet_events').insert([
      { at: pet.born_at, kind: 'birth', title: `Naissance de ${pet.name}`, detail: 'Un œuf est apparu dans la barre latérale' },
      { at: '2026-09-30T12:00:00Z', kind: 'healed', title: 'Nextcloud est sauvé', detail: 'Bloqué en pleine mise à jour 34 → 35 depuis le 27 septembre, réparé avec occ upgrade' },
      { at: '2026-09-30T12:00:01Z', kind: 'badge', title: 'Succès : Survivant de Nextcloud', detail: 'A tenu bon pendant la mise à jour ratée de Nextcloud', meta: { badge: 'nextcloud_survivor' } },
    ]);
    await knex('pet_badges').insert({ key: 'nextcloud_survivor', unlocked_at: '2026-09-30T12:00:01Z' }).onConflict('key').ignore();
  }
  console.log('✓ pet journal ready');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pet_events');
  await knex.schema.dropTableIfExists('pet_badges');
  await knex.schema.dropTableIfExists('disk_scans');
  for (const c of ['accessory', 'cine', 'pets_total']) {
    if (await knex.schema.hasColumn('pet', c)) await knex.schema.alterTable('pet', (t) => t.dropColumn(c));
  }
}
