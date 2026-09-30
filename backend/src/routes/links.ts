import { Router, Request, Response } from 'express';

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

/**
 * GET /api/links/preview?url=…
 * Fetches a page and returns what the quick-add dialog needs to fill itself:
 * a title, a short description and an icon URL. Never fails hard: when the
 * page can't be reached, the hostname stands in for the title.
 */
router.get('/preview', async (req: Request, res: Response) => {
  const raw = String(req.query.url || '').trim();
  let target: URL;
  try {
    target = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('protocol');
  } catch {
    res.status(400).json({ error: 'URL invalide' });
    return;
  }

  const fallbackTitle = target.hostname.replace(/^www\./, '').split('.')[0];
  const fallback = {
    url: target.toString(),
    title: fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1),
    description: null as string | null,
    icon: null as string | null,
    reachable: false,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const page = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (NexusPortal link preview)', accept: 'text/html' },
    });
    clearTimeout(timer);

    const type = page.headers.get('content-type') || '';
    if (!type.includes('html')) {
      res.json({ ...fallback, reachable: page.ok });
      return;
    }
    // The <head> is all we need; cap the read.
    const html = (await page.text()).slice(0, 300_000);
    const finalUrl = new URL(page.url || target.toString());
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

    // Behind an auth wall (Cloudflare Access & co.) the page is the login
    // screen, not the site: keep the hostname-based name and no icon.
    if (/cloudflareaccess\.com$/.test(finalUrl.hostname) || /Cloudflare Access/i.test(titleTag || '')) {
      res.json({ ...fallback, icon: null, reachable: true });
      return;
    }

    res.json({
      url: target.toString(),
      title: meta(html, 'og:site_name') || (titleTag ? decode(titleTag) : null) || meta(html, 'og:title') || fallback.title,
      description: meta(html, 'description') || meta(html, 'og:description'),
      icon: findIcon(html, finalUrl),
      reachable: page.ok,
    });
  } catch {
    res.json(fallback);
  }
});

export default router;
