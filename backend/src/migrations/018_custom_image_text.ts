import { Knex } from 'knex';

/** Icons may now be stored inline as data: URLs (services/linkcheck.ts): 255 characters are too few. */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE services ALTER COLUMN custom_image TYPE text');
}

export async function down(knex: Knex): Promise<void> {
  await knex('services').whereRaw('length(custom_image) > 255').update({ custom_image: null });
  await knex.raw('ALTER TABLE services ALTER COLUMN custom_image TYPE varchar(255)');
}
