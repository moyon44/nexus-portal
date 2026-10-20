import db from '../db.js';

/**
 * The creature's health book (pet_events): the server's history told as its
 * life. Written by the monitor (sick / healed), the updates (meal /
 * indigestion), the cleanup (bath), services/pet.ts (evolutions, badges) and
 * services/tv.ts (films) and routes/services.ts (a deleted link restored:
 * it dug it out of the bin). Kept one year.
 */

export type EventKind = 'birth' | 'sick' | 'healed' | 'meal' | 'indigestion' | 'bath' | 'evolve' | 'badge' | 'movie' | 'dig';

const listeners: ((kind: EventKind) => void)[] = [];

/** services/pet.ts checks the badges after each event. */
export function onEvent(fn: (kind: EventKind) => void) {
  listeners.push(fn);
}

export async function logEvent(kind: EventKind, title: string, detail?: string | null, meta: Record<string, unknown> = {}) {
  try {
    await db('pet_events').insert({ kind, title: title.slice(0, 160), detail: detail ? detail.slice(0, 300) : null, meta });
    for (const fn of listeners) fn(kind);
  } catch (e: any) {
    console.error('pet journal:', e.message);
  }
}

export async function getEvents(limit = 100, before?: number) {
  const q = db('pet_events').orderBy('at', 'desc').orderBy('id', 'desc').limit(Math.min(500, limit));
  if (before) q.where('id', '<', before);
  const rows = await q;
  return rows.map((r: any) => ({ id: r.id, at: r.at, kind: r.kind, title: r.title, detail: r.detail, meta: r.meta ?? {} }));
}

let lastCleanup = 0;
export async function cleanupJournal() {
  if (Date.now() - lastCleanup < 86_400_000) return;
  lastCleanup = Date.now();
  await db('pet_events').where('at', '<', db.raw(`now() - interval '1 year'`)).whereNot('kind', 'birth').delete();
}
