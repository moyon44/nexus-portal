import { Router, Request, Response } from 'express';

/**
 * Web search for the command palette (Ctrl K → "Web"), through the SearXNG
 * instance set in SEARXNG_URL (JSON output enabled: search.formats in its
 * settings.yml).
 * SEARXNG_URL points at it; the backend must be able to reach that address.
 */

const router = Router();
const SEARXNG = (process.env.SEARXNG_URL || 'http://searxng:8080').replace(/\/+$/, '');

router.get('/web', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  try {
    const params = new URLSearchParams({ q, format: 'json', language: 'fr', safesearch: '1' });
    const r = await fetch(`${SEARXNG}/search?${params}`, { signal: AbortSignal.timeout(6_000) });
    if (!r.ok) throw new Error(r.status === 403 ? 'SearXNG refuse le format JSON (search.formats)' : `SearXNG : HTTP ${r.status}`);
    const data: any = await r.json();
    const seen = new Set<string>();
    res.json(
      (data.results as any[])
        .filter((x) => x.url && !seen.has(x.url) && seen.add(x.url))
        .slice(0, 6)
        .map((x) => ({ title: x.title || x.url, url: x.url, content: String(x.content ?? '').slice(0, 160) })),
    );
  } catch (e: any) {
    const unreachable = e?.name === 'TimeoutError' || /fetch failed|ENOTFOUND|ECONNREFUSED/.test(`${e?.message} ${e?.cause?.code ?? ''}`);
    res.status(unreachable ? 503 : 502).json({ error: unreachable ? `SearXNG injoignable depuis le portail (${SEARXNG})` : e.message });
  }
});

export default router;
