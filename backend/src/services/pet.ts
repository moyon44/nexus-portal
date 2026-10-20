import db from '../db.js';
import { getHealth } from './monitor.js';
import { getUpdates } from './updates.js';
import { cleanupJournal, logEvent, onEvent } from './journal.js';

/**
 * The creature's experience (frontend components/Pet.tsx works out its mood
 * from live data). Every hour it gains 10 XP when every service answered,
 * 2 when something was down; an hour without outage extends the streak.
 * Petting gives 5 XP, six times a day at most.
 *
 * Stages: œuf < 50 ≤ bébé < 500 ≤ ado < 2400 ≤ adulte < 7200 ≤ légende.
 *
 * Badges unlock from its health book (services/journal.ts) and its streaks;
 * some give an accessory it can wear.
 */
export const STAGES = [
  { key: 'egg', label: 'Œuf', from: 0 },
  { key: 'baby', label: 'Bébé', from: 50 },
  { key: 'teen', label: 'Ado', from: 500 },
  { key: 'adult', label: 'Adulte', from: 2400 },
  { key: 'legend', label: 'Légende', from: 7200 },
] as const;

export const stageOf = (xp: number) => [...STAGES].reverse().find(s => xp >= s.from)!;

/* ----- Badges --------------------------------------------------------------- */

interface Stats {
  baths: number;
  cleanedGb: number;
  meals: number;
  heals: number;
  movies: number;
  bestStreak: number;
  pets: number;
  xp: number;
  allUpdated: boolean;
}

export const BADGES: {
  key: string;
  icon: string;
  label: string;
  description: string;
  accessory: string | null;
  progress?: (s: Stats) => [number, number];
}[] = [
  { key: 'first_meal', icon: '🍖', label: 'Premier repas', description: 'Manger une première mise à jour', accessory: null, progress: s => [s.meals, 1] },
  { key: 'gourmand', icon: '👨‍🍳', label: 'Gourmand', description: 'Manger 25 mises à jour', accessory: 'chef', progress: s => [s.meals, 25] },
  { key: 'all_updated', icon: '✨', label: 'Tout frais', description: 'Toutes les images Docker à jour', accessory: 'cap' },
  { key: 'first_bath', icon: '🫧', label: 'Premier bain', description: 'Un premier nettoyage Docker', accessory: null, progress: s => [s.baths, 1] },
  { key: 'clean_100', icon: '🛁', label: 'Grand ménage', description: '100 Go nettoyés au total', accessory: 'duck', progress: s => [Math.floor(s.cleanedGb), 100] },
  { key: 'first_heal', icon: '🩹', label: 'Rétabli', description: 'Guérir d’une première panne', accessory: null, progress: s => [s.heals, 1] },
  { key: 'week_no_outage', icon: '😎', label: 'Une semaine sans panne', description: '7 jours d’affilée sans aucune panne', accessory: 'glasses', progress: s => [Math.floor(s.bestStreak / 24), 7] },
  { key: 'month_no_outage', icon: '👑', label: '30 jours sans panne', description: '30 jours d’affilée sans aucune panne', accessory: 'crown', progress: s => [Math.floor(s.bestStreak / 24), 30] },
  { key: 'nextcloud_survivor', icon: '⛑️', label: 'Survivant de Nextcloud', description: 'Avoir tenu bon pendant la mise à jour ratée de Nextcloud', accessory: 'helmet' },
  { key: 'cinephile', icon: '🍿', label: 'Cinéphile', description: 'Regarder 10 films ou épisodes ensemble', accessory: 'glasses3d', progress: s => [s.movies, 10] },
  { key: 'cuddly', icon: '💕', label: 'Câlin', description: '100 caresses', accessory: 'bow', progress: s => [s.pets, 100] },
  { key: 'legend', icon: '🦸', label: 'Légende', description: 'Atteindre le stade Légende', accessory: 'cape', progress: s => [s.xp, 7200] },
];

const UNLOCK: Record<string, (s: Stats) => boolean> = {
  first_meal: s => s.meals >= 1,
  gourmand: s => s.meals >= 25,
  all_updated: s => s.allUpdated,
  first_bath: s => s.baths >= 1,
  clean_100: s => s.cleanedGb >= 100,
  first_heal: s => s.heals >= 1,
  week_no_outage: s => s.bestStreak >= 168,
  month_no_outage: s => s.bestStreak >= 720,
  cinephile: s => s.movies >= 10,
  cuddly: s => s.pets >= 100,
  legend: s => s.xp >= 7200,
};

async function stats(): Promise<Stats> {
  const pet = await db('pet').where('id', 1).first();
  const counts = await db('pet_events')
    .select('kind')
    .count('* as n')
    .select(db.raw(`coalesce(sum((meta->>'bytes')::bigint), 0) as bytes`))
    .groupBy('kind');
  const by = (k: string) => counts.find((c: any) => c.kind === k) as any;
  const u = getUpdates();
  const list = Object.values(u.containers);
  return {
    baths: Number(by('bath')?.n ?? 0),
    cleanedGb: Number(by('bath')?.bytes ?? 0) / 1024 ** 3,
    meals: Number(by('meal')?.n ?? 0),
    heals: Number(by('healed')?.n ?? 0),
    movies: Number(by('movie')?.n ?? 0),
    bestStreak: Math.max(pet.best_streak_h, pet.streak_h),
    pets: pet.pets_total ?? 0,
    xp: pet.xp,
    allUpdated: (u.checkedAt ?? 0) > 0 && list.length > 0 && !list.some(c => c.state === 'available' || c.state === 'recreate'),
  };
}

let checking = false;
async function checkBadges() {
  if (checking) return;
  checking = true;
  try {
    const s = await stats();
    const have = new Set((await db('pet_badges').select('key')).map((r: any) => r.key));
    for (const b of BADGES) {
      if (have.has(b.key) || !UNLOCK[b.key]?.(s)) continue;
      const inserted = await db('pet_badges').insert({ key: b.key }).onConflict('key').ignore().returning('key');
      if (inserted.length) await logEvent('badge', `Succès : ${b.label}`, b.description, { badge: b.key });
    }
  } finally {
    checking = false;
  }
}

export async function getBadges() {
  const s = await stats();
  const rows = await db('pet_badges').select('*');
  const at = new Map(rows.map((r: any) => [r.key, r.unlocked_at]));
  return BADGES.map(b => {
    const p = b.progress?.(s);
    return {
      key: b.key,
      icon: b.icon,
      label: b.label,
      description: b.description,
      accessory: b.accessory,
      unlockedAt: at.get(b.key) ?? null,
      progress: p ? { value: Math.min(p[0], p[1]), goal: p[1] } : null,
    };
  });
}

/* ----- Experience ------------------------------------------------------------ */

async function addXp(gain: number, extra: Record<string, unknown> = {}) {
  const pet = await db('pet').where('id', 1).first();
  const before = stageOf(pet.xp);
  const after = stageOf(pet.xp + gain);
  await db('pet').where('id', 1).update({ xp: pet.xp + gain, ...extra });
  if (after.key !== before.key) await logEvent('evolve', `${pet.name} a évolué : ${after.label} !`, `${pet.xp + gain} XP`, { stage: after.key });
}

async function tick() {
  const pet = await db('pet').where('id', 1).first();
  if (!pet) return;
  await cleanupJournal().catch(() => undefined);
  const hours = Math.floor((Date.now() - new Date(pet.last_tick).getTime()) / 3600_000);
  if (hours < 1) {
    await checkBadges();
    return;
  }
  const health = Object.values(getHealth());
  const allUp = health.length > 0 && health.every(h => h.status === 'online');
  // Missed hours (backend down) count once, not as a windfall.
  const gain = allUp ? 10 : 2;
  const streak = allUp ? pet.streak_h + 1 : 0;
  await addXp(gain, { last_tick: new Date(), streak_h: streak, best_streak_h: Math.max(pet.best_streak_h, streak) });
  await checkBadges();
}

export function startPet() {
  onEvent(kind => {
    if (kind !== 'badge') void checkBadges().catch(e => console.error('pet badges:', e.message));
  });
  void tick().catch(e => console.error('pet tick:', e.message));
  setInterval(() => void tick().catch(e => console.error('pet tick:', e.message)), 5 * 60_000);
}

export async function getPet() {
  const pet = await db('pet').where('id', 1).first();
  const stage = stageOf(pet.xp);
  const next = STAGES.find(s => s.from > pet.xp) ?? null;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  return {
    name: pet.name,
    bornAt: pet.born_at,
    xp: pet.xp,
    stage: stage.key,
    stageLabel: stage.label,
    stageFrom: stage.from,
    next: next ? { key: next.key, label: next.label, from: next.from } : null,
    streakHours: pet.streak_h,
    bestStreakHours: pet.best_streak_h,
    petsLeft: Math.max(0, 6 - (String(pet.pets_day ?? '').slice(0, 10) === today ? pet.pets_today : 0)),
    accessory: pet.accessory ?? null,
  };
}

export async function petIt() {
  const pet = await db('pet').where('id', 1).first();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const day = pet.pets_day ? new Date(pet.pets_day).toLocaleDateString('sv-SE') : null;
  const count = day === today ? pet.pets_today : 0;
  if (count < 6) await addXp(5, { pets_day: today, pets_today: count + 1, pets_total: (pet.pets_total ?? 0) + 1 });
  else await db('pet').where('id', 1).update({ pets_total: (pet.pets_total ?? 0) + 1 });
  await checkBadges();
  return getPet();
}

export async function renamePet(name: string) {
  await db('pet').where('id', 1).update({ name: name.trim().slice(0, 32) || 'Nexy' });
  return getPet();
}

/** Wears an accessory unlocked by a badge (null takes it off). */
export async function wear(accessory: string | null) {
  if (accessory !== null) {
    const badge = BADGES.find(b => b.accessory === accessory);
    if (!badge || !(await db('pet_badges').where({ key: badge.key }).first())) throw new Error('Accessoire pas encore débloqué');
  }
  await db('pet').where('id', 1).update({ accessory });
  return getPet();
}
