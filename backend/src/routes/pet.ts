import { Router, Request, Response } from 'express';
import { getPet, petIt, renamePet } from '../services/pet.js';

/** The creature in the sidebar (services/pet.ts). */
const router = Router();

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

export default router;
