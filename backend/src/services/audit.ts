import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

/**
 * One line of the action history (System page → Historique). Never throws:
 * a history that can't be written must not fail the action itself.
 */
export async function audit(e: {
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  req?: Request;
}): Promise<void> {
  try {
    await db('audit_logs').insert({
      id: uuidv4(),
      action: e.action,
      entity_type: e.entityType,
      entity_id: e.entityId.slice(0, 255),
      old_values: JSON.stringify(e.oldValues ?? {}),
      new_values: JSON.stringify(e.newValues ?? {}),
      ip_address: e.req?.ip ?? null,
      user_agent: e.req?.get('user-agent')?.slice(0, 255) ?? null,
      created_at: new Date(),
    });
  } catch (err: any) {
    console.error('audit:', err.message);
  }
}
