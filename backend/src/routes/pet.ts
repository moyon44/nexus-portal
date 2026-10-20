import { Router, Request, Response } from 'express';
import { getBadges, getPet, petIt, renamePet, wear } from '../services/pet.js';
import { getEvents } from '../services/journal.js';
import { getWatching } from '../services/tv.js';

/** The creature in the sidebar (services/pet.ts, journal.ts, tv.ts). */
const router = Router();

const fail = (res: Response, e: any, fallback: string) => res.status(e?.status ?? 500).json({ error: e?.message ?? fallback });

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await getPet());
  } catch {
    res.status(500).json({ error: 'Failed to fetch pet' });
  }
});

router.post('/pet', async (_req: Request, res: Response) => {
  try {
    res.json(await petIt());
  } catch {
    res.status(500).json({ error: 'Failed to pet' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    res.json(await renamePet(String(req.body?.name ?? '')));
  } catch {
    res.status(500).json({ error: 'Failed to rename' });
  }
});

// What it watches on Jellyfin (polled every 20 s).
router.get('/live', (_req: Request, res: Response) => {
  res.json({ watching: getWatching() });
});

// Health book, newest first: ?before=<id> for the next page.
router.get('/journal', async (req: Request, res: Response) => {
  try {
    res.json(await getEvents(Number(req.query.limit) || 60, Number(req.query.before) || undefined));
  } catch (e) {
    fail(res, e, 'Carnet indisponible');
  }
});

router.get('/badges', async (_req: Request, res: Response) => {
  try {
    res.json(await getBadges());
  } catch (e) {
    fail(res, e, 'Succès indisponibles');
  }
});

// { accessory: string | null }
router.put('/accessory', async (req: Request, res: Response) => {
  try {
    const a = req.body?.accessory;
    res.json(await wear(typeof a === 'string' ? a : null));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
