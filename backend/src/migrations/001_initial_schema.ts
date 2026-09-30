import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Categories table
  await knex.schema.createTable('categories', (table) => {
    table.uuid('id').primary();
    table.string('name').notNullable();
    table.string('color').notNullable();
    table.string('icon');
    table.integer('order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Services table
  await knex.schema.createTable('services', (table) => {
    table.uuid('id').primary();
    table.string('name').notNullable();
    table.string('description');
    table.string('url').notNullable();
    table.uuid('category_id').notNullable().references('id').inTable('categories').onDelete('CASCADE');
    table.text('tags').defaultTo('[]'); // JSON array as string
    table.string('icon').notNullable();
    table.string('custom_image');
    table.boolean('is_favorite').notNullable().defaultTo(false);
    table.string('status').notNullable().defaultTo('unknown'); // online, offline, maintenance, unknown
    table.boolean('open_in_new_tab').notNullable().defaultTo(true);
    table.boolean('is_visible').notNullable().defaultTo(true);
    table.integer('order').notNullable().defaultTo(0);
    table.jsonb('stats').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['category_id']);
  });

  // Theme configuration table
  await knex.schema.createTable('theme_config', (table) => {
    table.uuid('id').primary();
    table.string('mode').notNullable().defaultTo('auto'); // light, dark, auto
    table.string('primary_color').notNullable().defaultTo('#3b82f6');
    table.string('background_type').notNullable().defaultTo('solid'); // solid, gradient, image
    table.text('background_value').notNullable().defaultTo('#ffffff');
    table.string('density').notNullable().defaultTo('normal'); // compact, normal, spacious
    table.boolean('show_clock').notNullable().defaultTo(true);
    table.boolean('show_weather').notNullable().defaultTo(true);
    table.boolean('show_descriptions').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Audit logs table - tracks all changes
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary();
    table.string('action').notNullable(); // CREATE, UPDATE, DELETE
    table.string('entity_type').notNullable(); // SERVICE, CATEGORY, THEME_CONFIG
    table.uuid('entity_id').notNullable();
    table.jsonb('old_values').defaultTo('{}'); // Previous state
    table.jsonb('new_values').defaultTo('{}'); // New state
    table.string('ip_address');
    table.string('user_agent');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['entity_type']);
    table.index(['entity_id']);
    table.index(['created_at']);
  });

  // Service access logs - tracks when services are accessed
  await knex.schema.createTable('access_logs', (table) => {
    table.uuid('id').primary();
    table.uuid('service_id').notNullable().references('id').inTable('services').onDelete('CASCADE');
    table.string('ip_address');
    table.string('user_agent');
    table.timestamp('accessed_at').notNullable().defaultTo(knex.fn.now());
    table.index(['service_id']);
    table.index(['accessed_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('access_logs');
  await knex.schema.dropTable('audit_logs');
  await knex.schema.dropTable('theme_config');
  await knex.schema.dropTable('services');
  await knex.schema.dropTable('categories');
}
