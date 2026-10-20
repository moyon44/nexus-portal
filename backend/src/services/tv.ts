import db from '../db.js';
import { logEvent } from './journal.js';

/**
 * The creature watches TV: every 20 s it asks Jellyfin what is playing
 * (frontend shows it with popcorn) and writes each new title in its health
 * book.
 */

const TIMEOUT = 8_000;
const POLL = 20_000;

export interface Watching {
  user: string;
  device: string;
  client: string;
  title: string;
  subtitle: string | null;
  type: string;
  itemId: string;
  paused: boolean;
  progress: number | null;
}

let watching: Watching[] = [];
const seen = new Map<string, number>(); // user+item → last seen

async function poll() {
  const cfg = await db('integrations').where({ type: 'jellyfin' }).first();
  if (!cfg?.enabled || !cfg.url) {
    watching = [];
    return;
  }
  const key = cfg.api_key || process.env.JELLYFIN_API_KEY || '';
  const res = await fetch(`${String(cfg.url).replace(/\/+$/, '')}/Sessions?activeWithinSeconds=120`, {
    headers: { Authorization: `MediaBrowser Token="${key}"` },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Jellyfin : HTTP ${res.status}`);
  const sessions = (await res.json()) as any[];
  watching = sessions
    .filter((s) => s.NowPlayingItem && ['Movie', 'Episode', 'Video', 'MusicVideo'].includes(s.NowPlayingItem.Type))
    .map((s) => {
      const i = s.NowPlayingItem;
      const ticks = s.PlayState?.PositionTicks;
      return {
        user: s.UserName ?? '?',
        device: s.DeviceName ?? '',
        client: s.Client ?? '',
        title: i.SeriesName ?? i.Name,
        subtitle: i.SeriesName ? `S${String(i.ParentIndexNumber ?? 0).padStart(2, '0')}E${String(i.IndexNumber ?? 0).padStart(2, '0')} · ${i.Name}` : i.ProductionYear ? String(i.ProductionYear) : null,
        type: i.Type,
        itemId: i.Id,
        paused: !!s.PlayState?.IsPaused,
        progress: ticks && i.RunTimeTicks ? Math.round((ticks / i.RunTimeTicks) * 100) : null,
      };
    });

  // Health book: once per title per viewer (a pause or a resume is not a new film).
  const now = Date.now();
  for (const w of watching) {
    const key = `${w.user}|${w.itemId}`;
    if (!seen.has(key)) void logEvent('movie', `A regardé ${w.title}${w.type === 'Episode' && w.subtitle ? ` (${w.subtitle.split(' · ')[0]})` : ''}`, `Avec ${w.user} sur ${w.device}`, { user: w.user, type: w.type, itemId: w.itemId });
    seen.set(key, now);
  }
  for (const [k, t] of seen) if (now - t > 6 * 3600_000) seen.delete(k);
}

export function getWatching() {
  return watching;
}

export async function startTvWatch() {
  // A restart is not a new film.
  const recent = await db('pet_events').where({ kind: 'movie' }).where('at', '>', db.raw(`now() - interval '6 hours'`)).catch(() => []);
  for (const e of recent) seen.set(`${e.meta?.user}|${e.meta?.itemId}`, new Date(e.at).getTime());
  const tick = () => void poll().catch((e) => console.error('pet tv:', e.message));
  tick();
  setInterval(tick, POLL);
}
