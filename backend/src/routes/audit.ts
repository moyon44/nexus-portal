import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// Get audit logs with filters
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, action, limit = 100, offset = 0 } = req.query;

    let query = db('audit_logs');

    if (entity_type) query = query.where('entity_type', entity_type as string);
    if (entity_id) query = query.where('entity_id', entity_id as string);
    if (action) query = query.where('action', action as string);

    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit as string) || 100)
      .offset(parseInt(offset as string) || 0);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get access logs for a service
router.get('/access/:service_id', async (req: Request, res: Response) => {
  try {
    const { service_id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const logs = await db('access_logs')
      .where('service_id', service_id)
      .orderBy('accessed_at', 'desc')
      .limit(parseInt(limit as string) || 100)
      .offset(parseInt(offset as string) || 0);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch access logs' });
  }
});

// Get audit log details
router.get('/logs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const log = await db('audit_logs').where('id', id).first();
    if (!log) {
      res.status(404).json({ error: 'Audit log not found' });
      return;
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Get stats - count changes by entity type
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await db('audit_logs')
      .select('entity_type', 'action')
      .count('* as count')
      .groupBy('entity_type', 'action');

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
