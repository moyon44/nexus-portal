import { Knex } from 'knex';

/**
 * audit_logs.entity_id was a uuid, but containers, Home Assistant entities and
 * Nextcloud actions are named, not uuid'd: their rows were rejected (and the
 * restart route answered 500 after restarting). Text fits every kind.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE audit_logs ALTER COLUMN entity_id TYPE varchar(255) USING entity_id::text');
}

export async function down(knex: Knex): Promise<void> {
  await knex('audit_logs').whereRaw(`entity_id !~ '^[0-9a-f-]{36}$'`).delete();
  await knex.raw('ALTER TABLE audit_logs ALTER COLUMN entity_id TYPE uuid USING entity_id::uuid');
}
