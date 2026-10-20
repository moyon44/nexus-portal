import { Knex } from 'knex';

/** Result of the last check of each external link (services/linkcheck.ts). */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('link_checks')) return;
  await knex.schema.createTable('link_checks', (t) => {
    t.uuid('service_id').primary().references('id').inTable('services').onDelete('CASCADE');
    t.boolean('dead').notNullable().defaultTo(false);
    t.integer('status').nullable();
    t.string('reason', 255).nullable();
    t.timestamp('checked_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('link_checks');
}
