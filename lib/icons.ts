import { useEffect, useState } from 'react';

/**
 * Official app logos from homarr-labs/dashboard-icons, served by jsDelivr.
 *
 * The repository's tree.json (every file name) is fetched once and cached in
 * localStorage for a week, so a tile only requests a logo that exists: no
 * 404 per unknown name. A service matches by its explicit `di:<slug>` icon,
 * else by its name ("Home Assistant" → home-assistant). The host is not used:
 * subdomains like `ui.` or `dashboard.` would pick unrelated logos.
 */

const CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const INDEX_URL = `${CDN}/tree.json`;
const CACHE_KEY = 'portail:dashboard-icons';
const CACHE_TTL = 7 * 24 * 3600 * 1000;

type IconIndex = { svg: Set<string>; png: Set<string> };

let index: IconIndex | null = null;
let loading: Promise<IconIndex | null> | null = null;
const listeners = new Set<() => void>();

function fromNames(svg: string[], png: string[]): IconIndex {
  const strip = (names: string[], ext: string) => new Set(names.map(n => n.slice(0, -ext.length)));
  return { svg: strip(svg, '.svg'), png: strip(png, '.png') };
}

function readCache(): IconIndex | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { at: number; svg: string[]; png: string[] };
    if (Date.now() - cached.at > CACHE_TTL) return null;
    return { svg: new Set(cached.svg), png: new Set(cached.png) };
  } catch {
    return null;
  }
}

function loadIndex(): Promise<IconIndex | null> {
  if (index) return Promise.resolve(index);
  if (loading) return loading;
  const cached = readCache();
  if (cached) {
    index = cached;
    return Promise.resolve(index);
  }
  loading = fetch(INDEX_URL)
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((tree: { svg?: string[]; png?: string[] }) => {
      index = fromNames(tree.svg ?? [], tree.png ?? []);
      try {
        window.localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ at: Date.now(), svg: [...index.svg], png: [...index.png] }),
        );
      } catch {
        // Too big or storage blocked: the index lives for this session.
      }
      listeners.forEach(l => l());
      return index;
    })
    .catch(() => null)
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function candidates(service: { name: string; icon?: string }): string[] {
  const out: string[] = [];
  if (service.icon?.startsWith('di:')) out.push(service.icon.slice(3));
  const slug = slugify(service.name);
  out.push(slug, slug.replace(/-/g, ''));
  return out.filter(Boolean);
}

/** Logo URL for a service, or null when dashboard-icons has none. */
export function dashboardIconUrl(
  service: { name: string; icon?: string },
  idx: IconIndex | null = index,
): string | null {
  if (!idx) return null;
  const dark = document.documentElement.classList.contains('dark');
  for (const slug of candidates(service)) {
    // Prefer the variant drawn for the current background when one exists.
    const themed = dark ? `${slug}-light` : `${slug}-dark`;
    if (idx.svg.has(slug)) return `${CDN}/svg/${idx.svg.has(themed) ? themed : slug}.svg`;
    if (idx.png.has(slug)) return `${CDN}/png/${idx.png.has(themed) ? themed : slug}.png`;
  }
  return null;
}

/** Re-renders once the index is available (from cache: immediately). */
export function useIconIndex(): IconIndex | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (index) return;
    const l = () => force(n => n + 1);
    listeners.add(l);
    loadIndex().then(() => force(n => n + 1));
    return () => {
      listeners.delete(l);
    };
  }, []);
  return index ?? (typeof window !== 'undefined' ? (index = readCache()) : null);
}
