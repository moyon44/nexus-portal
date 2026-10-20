import db from '../db.js';
import { audit } from './audit.js';
import { parseTarget, readPreview } from '../routes/links.js';

/**
 * External links (not the home-lab services, which the health monitor
 * already watches): once a day, and from Admin on demand,
 *  - fill what's missing: an icon that is absent or doesn't load, an empty
 *    description, a name that is only the address or a page title that
 *    isn't the site's name ("Just a moment...", "Site — long tagline");
 *  - spot dead links: page gone (404 / 410) or site that doesn't answer.
 * Fills never overwrite what was written by hand, and every rename goes to
 * the history (so it can be read back there).
 */

const DAY = 24 * 3600_000;
const PRIVATE_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])$|\.(local|lan|home|internal)$/i;
const NETWORK_DEAD = /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|CERT|SSL|ERR_TLS|UNABLE_TO_VERIFY|EHOSTUNREACH|ENETUNREACH|TimeoutError|AbortError/i;

export interface CheckReport {
  checkedAt: string;
  checked: number;
  filled: { id: string; name: string; changes: string[] }[];
  dead: { id: string; name: string; url: string; reason: string }[];
}

let running: Promise<CheckReport> | null = null;
let last: CheckReport | null = null;

/** The domain most links share (say example.com): those are home-lab services. */
function baseDomainOf(urls: string[]): string | null {
  const counts = new Map<string, number>();
  for (const u of urls) {
    try {
      const labels = new URL(u).hostname.split('.');
      if (labels.length > 2) {
        const base = labels.slice(-2).join('.');
        counts.set(base, (counts.get(base) ?? 0) + 1);
      }
    } catch {
      // Not a URL.
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 ? best[0] : null;
}

function isExternal(url: string, base: string | null) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || PRIVATE_HOST.test(h)) return false;
    return !(base && (h === base || h.endsWith(`.${base}`)));
  } catch {
    return false;
  }
}

/** Icons up to this size are kept in the database as data: URLs. */
const EMBED_MAX = 32 * 1024;

/**
 * Fetches an icon: null if it doesn't serve an image, else the address to
 * store — a data: URL when small. Some sites' icons load for the server but
 * not in the browser (hotlink rules, .ico quirks); embedded, they always
 * show, and the tile can read its brand colour from them.
 */
async function fetchIcon(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:image/')) return src;
  // GitHub avatars stay addresses: the portal recognises them by it (lib/github.ts).
  if (/^https:\/\/(github\.com\/[^/]+\.png|avatars\.githubusercontent\.com\/)/.test(src)) return src;
  if (!/^https?:/.test(src)) return null;
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 (NexusPortal link check)' } });
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!r.ok || !/image|icon|octet-stream/i.test(type)) {
      await r.body?.cancel().catch(() => undefined);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    if (buf.length > EMBED_MAX) return src;
    const mime = /image\//.test(type) ? type : /\.ico(\?|$)/i.test(src) ? 'image/x-icon' : /\.svg(\?|$)/i.test(src) ? 'image/svg+xml' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** A name worth replacing: the bare address, a bot check, or "Name — tagline". */
function betterName(name: string, title: string, host: string): string | null {
  const n = name.trim();
  const clean = (t: string) => {
    const first = t.split(/\s+[-–—|·:]\s+/)[0].trim();
    return first.length >= 2 ? first : t.trim();
  };
  const bare = /^[\w.-]+\.[a-z]{2,}$/i.test(n) || n.toLowerCase() === host;
  const bot = /^\s*just a moment/i.test(n);
  const long = n.length > 24 && /\s[-–—|·:]\s/.test(n);
  if (!bare && !bot && !long) return null;
  const candidate = clean(bare || bot ? title : n);
  if (!candidate || /^\s*just a moment/i.test(candidate) || candidate === n) return null;
  return candidate.slice(0, 60);
}

async function run(): Promise<CheckReport> {
  const services = await db('services').select('*');
  const base = baseDomainOf(services.map((s: any) => s.url));
  const external = services.filter((s: any) => isExternal(s.url, base));
  const report: CheckReport = { checkedAt: new Date().toISOString(), checked: external.length, filled: [], dead: [] };

  for (const s of external) {
    const target = parseTarget(s.url);
    if (!target) continue;
    let p = await readPreview(target);
    // A timeout can be a slow moment: one more try before calling it dead.
    if (p.error && /Timeout|Abort/i.test(p.error)) p = await readPreview(target);

    const dead = p.status === 404 || p.status === 410 || (!!p.error && NETWORK_DEAD.test(p.error));
    const reason = dead ? (p.status ? `page introuvable (${p.status})` : /Timeout|Abort/i.test(p.error ?? '') ? 'ne répond pas' : 'site injoignable') : null;
    await db('link_checks')
      .insert({ service_id: s.id, dead, status: p.status ?? null, reason, checked_at: new Date() })
      .onConflict('service_id')
      .merge();
    if (dead) {
      report.dead.push({ id: s.id, name: s.name, url: s.url, reason: reason! });
      continue;
    }

    const update: Record<string, unknown> = {};
    const changes: string[] = [];
    const name = betterName(s.name ?? '', p.title ?? '', target.hostname.replace(/^www\./, ''));
    if (name) {
      update.name = name;
      changes.push(`nom : « ${s.name} » → « ${name} »`);
    }
    if (!(s.description ?? '').trim() && p.description) {
      update.description = p.description.slice(0, 140);
      changes.push('description ajoutée');
    }
    const current = await fetchIcon(s.custom_image);
    if (current) {
      // Same icon, now embedded: not worth a line in the report.
      if (current !== s.custom_image) update.custom_image = current;
    } else {
      const candidates = [p.icon, `${target.origin}/favicon.ico`].filter((x): x is string => !!x && x !== s.custom_image);
      for (const c of candidates) {
        const icon = await fetchIcon(c);
        if (icon) {
          update.custom_image = icon;
          changes.push(s.custom_image ? 'icône réparée' : 'icône ajoutée');
          break;
        }
      }
    }
    if (!Object.keys(update).length) continue;
    await db('services').where('id', s.id).update({ ...update, updated_at: new Date() });
    if (!changes.length) continue;
    void audit({
      action: 'UPDATE',
      entityType: 'SERVICE',
      entityId: s.id,
      oldValues: { name: s.name, description: s.description, custom_image: s.custom_image },
      newValues: { name: update.name ?? s.name, ...update },
    });
    report.filled.push({ id: s.id, name: (update.name as string) ?? s.name, changes });
  }
  last = report;
  return report;
}

/** Runs a check, or joins the one in progress. */
export function checkLinks(): Promise<CheckReport> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

export function lastReport() {
  return last;
}

/** Dead links from the last check, by service id. */
export async function deadLinks(): Promise<Record<string, { reason: string; checkedAt: string }>> {
  const rows = await db('link_checks').where({ dead: true });
  return Object.fromEntries(rows.map((r: any) => [r.service_id, { reason: r.reason ?? 'lien mort', checkedAt: new Date(r.checked_at).toISOString() }]));
}

export function startLinkChecks() {
  // A few minutes after start, then daily.
  setTimeout(() => void checkLinks().catch((e) => console.error('link check:', e.message)), 5 * 60_000);
  setInterval(() => void checkLinks().catch((e) => console.error('link check:', e.message)), DAY);
}
