import { Knex } from 'knex';

/**
 * - health_samples: every health check, kept 7 days (uptime 24 h / 7 j).
 * - integrations: credentials for the live tile widgets (qBittorrent,
 *   Jellyfin, Sonarr, Radarr, Home Assistant). Secrets never leave the backend.
 * - theme_config.alert_webhook: added for alerts, which were then dropped;
 *   the column is unused.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('health_samples'))) {
    await knex.schema.createTable('health_samples', (table) => {
      table.bigIncrements('id').primary();
      table.uuid('service_id').notNullable();
      table.timestamp('t', { useTz: true }).notNullable();
      table.boolean('up').notNullable();
      table.integer('ms').nullable();
      table.index(['service_id', 't']);
      table.index(['t']);
    });
  }

  if (!(await knex.schema.hasTable('integrations'))) {
    await knex.schema.createTable('integrations', (table) => {
      table.string('type', 32).primary(); // qbittorrent | jellyfin | sonarr | radarr | jellyseerr | nextcloud | kdrive | homeassistant
      table.boolean('enabled').notNullable().defaultTo(true);
      table.uuid('service_id').nullable(); // tile showing the widget
      table.string('url', 512).nullable();
      table.text('api_key').nullable();
      table.string('username', 255).nullable();
      table.text('password').nullable();
      table.jsonb('options').defaultTo('{}');
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasColumn('theme_config', 'alert_webhook'))) {
    await knex.schema.alterTable('theme_config', (table) => {
      table.string('alert_webhook', 1024).nullable();
    });
  }
  console.log('✓ health_samples, integrations, alert_webhook ready');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('health_samples');
  await knex.schema.dropTableIfExists('integrations');
  await knex.schema.alterTable('theme_config', (table) => {
    table.dropColumn('alert_webhook');
  });
}
