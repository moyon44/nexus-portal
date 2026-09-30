import db from '../db.js';
import { getHealth } from './monitor.js';

/**
 * The creature's experience (frontend components/Pet.tsx works out its mood
 * from live data). Every hour it gains 10 XP when every service answered,
 * 2 when something was down; an hour without outage extends the streak.
 * Petting gives 5 XP, six times a day at most.
 *
 * Stages: œuf < 50 ≤ bébé < 500 ≤ ado < 2400 ≤ adulte < 7200 ≤ légende.
 */
export const STAGES = [
  { key: 'egg', label: 'Œuf', from: 0 },
  { key: 'baby', label: 'Bébé', from: 50 },
  { key: 'teen', label: 'Ado', from: 500 },
  { key: 'adult', label: 'Adulte', from: 2400 },
  { key: 'legend', label: 'Légende', from: 7200 },
] as const;

export const stageOf = (xp: number) => [...STAGES].reverse().find(s => xp >= s.from)!;

async function tick() {
  const pet = await db('pet').where('id', 1).first();
  if (!pet) return;
  const hours = Math.floor((Date.now() - new Date(pet.last_tick).getTime()) / 3600_000);
  if (hours < 1) return;
  const health = Object.values(getHealth());
  const allUp = health.length > 0 && health.every(h => h.status === 'online');
  // Missed hours (backend down) count once, not as a windfall.
  const gain = allUp ? 10 : 2;
  const streak = allUp ? pet.streak_h + 1 : 0;
  await db('pet')
    .where('id', 1)
    .update({
      xp: pet.xp + gain,
      last_tick: new Date(),
      streak_h: streak,
      best_streak_h: Math.max(pet.best_streak_h, streak),
    });
}

export function startPet() {
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
  };
}

export async function petIt() {
  const pet = await db('pet').where('id', 1).first();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const day = pet.pets_day ? new Date(pet.pets_day).toLocaleDateString('sv-SE') : null;
  const count = day === today ? pet.pets_today : 0;
  if (count < 6) await db('pet').where('id', 1).update({ xp: pet.xp + 5, pets_day: today, pets_today: count + 1 });
  return getPet();
}

export async function renamePet(name: string) {
  await db('pet').where('id', 1).update({ name: name.trim().slice(0, 32) || 'Nexy' });
  return getPet();
}
