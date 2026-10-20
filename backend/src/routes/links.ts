import { Router, Request, Response } from 'express';
import { checkLinks, deadLinks, lastReport } from '../services/linkcheck.js';

const router = Router();

/** Decodes the handful of HTML entities that show up in <title> tags. */
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

const meta = (html: string, key: string) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const k = attr(tag, 'property') ?? attr(tag, 'name');
    if (k && k.toLowerCase() === key) {
      const content = attr(tag, 'content');
      if (content) return decode(content);
    }
  }
  return null;
};

/** Best icon from the page's <link> tags: apple-touch-icon, then icon. */
const findIcon = (html: string, base: URL) => {
  const links = (html.match(/<link\b[^>]*>/gi) || [])
    .map((tag) => ({ rel: (attr(tag, 'rel') || '').toLowerCase(), href: attr(tag, 'href') }))
    .filter((l) => l.href && /(^|\s)(icon|apple-touch-icon|shortcut icon)(\s|$)/.test(l.rel));
  const pick = links.find((l) => l.rel.includes('apple-touch-icon')) || links.find((l) => l.rel.includes('icon'));
  try {
    return new URL(pick?.href || '/favicon.ico', base).toString();
  } catch {
    return null;
  }
};

const GH_RESERVED = new Set(['orgs', 'settings', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'sponsors', 'notifications', 'issues', 'pulls', 'search', 'login', 'join', 'features', 'enterprise', 'pricing', 'about', 'apps', 'codespaces', 'new', 'organizations', 'site', 'security', 'customer-stories']);

/** github.com/<owner>/<repo>[/…] → owner and repo (same rule as lib/github.ts). */
function githubRepo(u: URL): { owner: string; repo: string } | null {
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repo || GH_RESERVED.has(owner.toLowerCase())) return null;
  return { owner, repo: repo.replace(/\.git$/, '') };
}

type Preview = {
  url: string;
  title: string;
  description: string | null;
  icon: string | null;
  /** og:image / twitter:image: the picture the hover card shows. */
  image: string | null;
  reachable: boolean;
  github?: { owner: string; repo: string };
  /** HTTP status of the page, or the network error code when it didn't answer. */
  status?: number;
  error?: string;
};

/** Reads a page for its title, description, icon and share image. Never throws. */
export async function readPreview(target: URL): Promise<Preview> {
  const fallbackTitle = target.hostname.replace(/^www\./, '').split('.')[0];
  const fallback: Preview = {
    url: target.toString(),
    title: fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1),
    description: null,
    icon: null,
    image: null,
    reachable: false,
  };

  // GitHub repository: the repo is the name, the owner's avatar the icon
  // (every page of github.com would otherwise be called "GitHub"), and
  // GitHub's own social card the image.
  const gh = githubRepo(target);
  if (gh) {
    const base: Preview = {
      url: target.toString(),
      title: gh.repo,
      description: null,
      icon: `https://github.com/${encodeURIComponent(gh.owner)}.png?size=96`,
      image: `https://opengraph.githubassets.com/1/${gh.owner}/${gh.repo}`,
      reachable: true,
      github: gh,
    };
    try {
      const r = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}`, {
        headers: { 'user-agent': 'NexusPortal', accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(4000),
      });
      const j: any = r.ok ? await r.json() : null;
      return j
        ? { ...base, title: j.name || gh.repo, description: j.description || null, github: { owner: j.owner?.login || gh.owner, repo: j.name || gh.repo } }
        : base;
    } catch {
      return base;
    }
  }

  try {
    const page = await fetch(target, {
      signal: AbortSignal.timeout(4000),
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (NexusPortal link preview)', accept: 'text/html' },
    });
    const type = page.headers.get('content-type') || '';
    if (!type.includes('html')) return { ...fallback, reachable: page.ok, status: page.status };
    // The <head> is all we need; cap the read.
    const html = (await page.text()).slice(0, 300_000);
    const finalUrl = new URL(page.url || target.toString());
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

    // Behind an auth wall (Cloudflare Access & co.) the page is the login
    // screen, not the site: keep the hostname-based name and no icon.
    // Cloudflare's bot check ("Just a moment...") is not the site either.
    if (/cloudflareaccess\.com$/.test(finalUrl.hostname) || /Cloudflare Access|^\s*Just a moment/i.test(titleTag || '')) {
      return { ...fallback, reachable: true, status: page.status };
    }

    const img = meta(html, 'og:image') || meta(html, 'og:image:url') || meta(html, 'twitter:image') || meta(html, 'twitter:image:src');
    let image: string | null = null;
    try {
      image = img ? new URL(img, finalUrl).toString() : null;
    } catch {
      image = null;
    }
    return {
      url: target.toString(),
      title: meta(html, 'og:site_name') || (titleTag ? decode(titleTag) : null) || meta(html, 'og:title') || fallback.title,
      description: meta(html, 'description') || meta(html, 'og:description'),
      icon: findIcon(html, finalUrl),
      image: image && /^https?:/.test(image) ? image : null,
      reachable: page.ok,
      status: page.status,
    };
  } catch (e: any) {
    return { ...fallback, error: String(e?.cause?.code ?? e?.name ?? 'ERROR') };
  }
}

export const parseTarget = (raw: string): URL | null => {
  try {
    const t = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(t.protocol) ? t : null;
  } catch {
    return null;
  }
};

/**
 * GET /api/links/preview?url=…
 * What the quick-add dialog needs to fill itself: a title, a short
 * description and an icon. Never fails hard: when the page can't be
 * reached, the hostname stands in for the title.
 */
router.get('/preview', async (req: Request, res: Response) => {
  const target = parseTarget(String(req.query.url || '').trim());
  if (!target) return void res.status(400).json({ error: 'URL invalide' });
  res.json(await readPreview(target));
});

/*
 * GET /api/links/card?url=…
 * The hover card of an external link: image + description, cached a day
 * (failures an hour) so hovering doesn't hit the site every time.
 */
const cards = new Map<string, { at: number; ttl: number; body: { image: string | null; description: string | null; title: string } }>();
const CARD_TTL = 24 * 3600_000;
const CARD_MISS_TTL = 3600_000;

router.get('/card', async (req: Request, res: Response) => {
  const target = parseTarget(String(req.query.url || '').trim());
  if (!target) return void res.status(400).json({ error: 'URL invalide' });
  const key = target.toString();
  const hit = cards.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return void res.json(hit.body);
  const p = await readPreview(target);
  const body = { image: p.image, description: p.description, title: p.title };
  if (cards.size > 500) cards.delete(cards.keys().next().value as string);
  cards.set(key, { at: Date.now(), ttl: p.reachable ? CARD_TTL : CARD_MISS_TTL, body });
  res.json(body);
});

/* ----- Link check (Admin → Liens): fills missing info, spots dead links ----- */

// Dead links of the last check, by service id (tile badges).
router.get('/dead', async (req: Request, res: Response) => {
  try {
    res.json(await deadLinks());
  } catch {
    res.json({});
  }
});

// Last report (null before the first run since the backend started).
router.get('/check', (req: Request, res: Response) => {
  res.json(lastReport());
});

// Runs a check now and answers with its report (can take a minute).
router.post('/check', async (req: Request, res: Response) => {
  try {
    res.json(await checkLinks());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
