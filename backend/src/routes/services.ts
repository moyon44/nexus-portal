import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { checkNow, getHealth } from '../services/monitor.js';

const router = Router();

// Log access to a service
router.post('/:id/access', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db('access_logs').insert({
      id: uuidv4(),
      service_id: id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log access' });
  }
});

// Get all services
router.get('/', async (req: Request, res: Response) => {
  try {
    const services = await db('services').select('*');
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Live status for all visible services, from the health monitor's cache.
router.get('/live-status', (req: Request, res: Response) => {
  const liveStatus: Record<string, 'online' | 'offline'> = {};
  for (const [id, h] of Object.entries(getHealth())) liveStatus[id] = h.status;
  res.json(liveStatus);
});

// Status, latency, recent history and container usage for every visible
// service: { [id]: { status, latency, history: [{ t, up, ms }], container? } }.
router.get('/health', (req: Request, res: Response) => {
  res.json(getHealth());
});

// Recently opened links and how often each is used (last 30 days):
// { recent: [{ id, at }], usage: { [id]: count } }.
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '8'), 10) || 8, 20);
    const recent = await db('access_logs')
      .select('service_id as id')
      .max('accessed_at as at')
      .groupBy('service_id')
      .orderBy('at', 'desc')
      .limit(limit);
    const counts = await db('access_logs')
      .select('service_id')
      .count('* as n')
      .where('accessed_at', '>', db.raw(`now() - interval '30 days'`))
      .groupBy('service_id');
    res.json({
      recent,
      usage: Object.fromEntries(counts.map((c: any) => [c.service_id, Number(c.n)])),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recent services' });
  }
});

// Get single service
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const service = await db('services').where('id', id).first();
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// Create service
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, url, category_id, tags, icon, custom_image, open_in_new_tab, is_visible, order, stats } = req.body;
    const id = uuidv4();

    // Get old values (empty for new)
    const oldValues = {};

    // If no category provided, use the first one
    let finalCategoryId = category_id;
    if (!finalCategoryId) {
      const firstCategory = await db('categories').orderBy('order', 'asc').first();
      if (firstCategory) {
        finalCategoryId = firstCategory.id;
      }
    }

    // Prepare new values
    const newService = {
      id,
      name,
      description,
      url,
      category_id: finalCategoryId,
      tags: JSON.stringify(tags || []),
      icon,
      custom_image,
      open_in_new_tab: open_in_new_tab !== false,
      is_visible: is_visible !== false,
      order: order || 0,
      stats: JSON.stringify(stats && typeof stats === 'object' ? stats : {}),
    };

    // Insert service
    await db('services').insert(newService);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'CREATE',
      entity_type: 'SERVICE',
      entity_id: id,
      old_values: oldValues,
      new_values: newService,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    checkNow(id);
    res.status(201).json(newService);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Reorder services in one go: [{ id, category_id, order }]. Used by the
// home page tree when links are dragged within or between folders.
router.put('/reorder', async (req: Request, res: Response) => {
  const items: { id: string; category_id?: string; order: number }[] = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: 'No items to reorder' });
    return;
  }
  try {
    await db.transaction(async (trx) => {
      for (const item of items) {
        const update: Record<string, unknown> = { order: item.order, updated_at: new Date() };
        if (item.category_id) update.category_id = item.category_id;
        await trx('services').where('id', item.id).update(update);
      }
    });
    res.json({ ok: true, count: items.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reorder services' });
  }
});

// Update service
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const oldService = await db('services').where('id', id).first();

    if (!oldService) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const { name, description, url, category_id, tags, icon, custom_image, is_favorite, status, open_in_new_tab, is_visible, order, stats } = req.body;

    const updateData = {
      name,
      description,
      url,
      category_id,
      tags: JSON.stringify(tags || []),
      icon,
      custom_image,
      is_favorite,
      status,
      open_in_new_tab,
      is_visible,
      order,
      stats: stats ? JSON.stringify(stats) : undefined,
      updated_at: new Date(),
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]);

    // Update service
    await db('services').where('id', id).update(updateData);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'UPDATE',
      entity_type: 'SERVICE',
      entity_id: id,
      old_values: oldService,
      new_values: updateData,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    if ((url && url !== oldService.url) || stats || is_visible) checkNow(id);
    res.json(updateData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const service = await db('services').where('id', id).first();

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Log audit before deletion
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'DELETE',
      entity_type: 'SERVICE',
      entity_id: id,
      old_values: service,
      new_values: {},
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    await db('services').where('id', id).delete();

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

/**
 * POST /api/services/:id/restore
 * Brings a deleted link back exactly as it was, from the row its DELETE
 * audit line kept (same id, so its access history comes back with it).
 * Its folder may be gone too: it then lands in the first folder.
 */
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (await db('services').where('id', id).first()) {
      res.status(409).json({ error: 'Ce lien existe déjà' });
      return;
    }
    const log = await db('audit_logs').where({ entity_type: 'SERVICE', action: 'DELETE', entity_id: id }).orderBy('created_at', 'desc').first();
    const old = typeof log?.old_values === 'string' ? JSON.parse(log.old_values) : log?.old_values;
    if (!old?.url) {
      res.status(404).json({ error: 'Rien à restaurer' });
      return;
    }
    let categoryId = old.category_id;
    if (!(await db('categories').where('id', categoryId).first())) {
      categoryId = (await db('categories').orderBy('order').first())?.id;
      if (!categoryId) {
        res.status(409).json({ error: 'Aucun dossier pour accueillir ce lien' });
        return;
      }
    }
    const row = {
      id,
      name: old.name,
      description: old.description ?? '',
      url: old.url,
      category_id: categoryId,
      tags: typeof old.tags === 'string' ? old.tags : JSON.stringify(old.tags ?? []),
      icon: old.icon ?? 'lucide:link',
      custom_image: old.custom_image ?? null,
      is_favorite: !!old.is_favorite,
      status: 'unknown',
      open_in_new_tab: old.open_in_new_tab ?? true,
      is_visible: old.is_visible ?? true,
      order: old.order ?? 0,
      stats: JSON.stringify(old.stats ?? {}),
      created_at: old.created_at ?? new Date(),
      updated_at: new Date(),
    };
    await db('services').insert(row);
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'RESTORE',
      entity_type: 'SERVICE',
      entity_id: id,
      old_values: {},
      new_values: { name: row.name, category_id: categoryId },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });
    res.json({ success: true, id, categoryId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Restauration impossible' });
  }
});

export default router;
