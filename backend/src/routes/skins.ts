import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

/**
 * Styles made in the Studio (frontend components/Studio.tsx). The config is
 * the JSON of the Studio's controls; the frontend turns it into CSS.
 * A theme uses one as skin = 'custom:<id>'.
 */
const router = Router();

const clean = (body: any) => {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 64) : '';
  const config = body?.config;
  if (!name || !config || typeof config !== 'object' || Array.isArray(config)) return null;
  if (JSON.stringify(config).length > 8000) return null;
  return { name, config };
};

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await db('custom_skins').select('id', 'name', 'config').orderBy('created_at', 'asc'));
  } catch {
    res.status(500).json({ error: 'Failed to fetch skins' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const v = clean(req.body);
  if (!v) return void res.status(400).json({ error: 'name and config required' });
  try {
    const id = uuidv4();
    await db('custom_skins').insert({ id, name: v.name, config: JSON.stringify(v.config) });
    res.json({ id, ...v });
  } catch {
    res.status(500).json({ error: 'Failed to save skin' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const v = clean(req.body);
  if (!v) return void res.status(400).json({ error: 'name and config required' });
  try {
    const n = await db('custom_skins').where('id', req.params.id).update({ name: v.name, config: JSON.stringify(v.config), updated_at: new Date() });
    if (!n) return void res.status(404).json({ error: 'Not found' });
    res.json({ id: req.params.id, ...v });
  } catch {
    res.status(500).json({ error: 'Failed to save skin' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db('custom_skins').where('id', req.params.id).delete();
    // A theme still pointing at it falls back to the default style.
    await db('theme_config').where('skin', `custom:${req.params.id}`).update({ skin: 'default' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete skin' });
  }
});

export default router;
