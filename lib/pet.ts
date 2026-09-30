import type { AppData } from '../types';

/**
 * The creature's needs, from live data (components/Pet.tsx):
 *   Santé     share of services online
 *   Satiété   drops 15 points per pending image update (it "eats" updates)
 *   Propreté  drops 25 points per Go that `docker prune` could free
 *   Énergie   falls when the disk passes 60 % or the CPU runs hot
 * The mood is the most pressing need; at night, with nothing wrong, it sleeps.
 */

export type PetStage = 'egg' | 'baby' | 'teen' | 'adult' | 'legend';
export type PetMood = 'happy' | 'sick' | 'hungry' | 'dirty' | 'tired' | 'sleeping' | 'eating' | 'loved' | 'bath';

export interface PetState {
  name: string;
  bornAt: string;
  xp: number;
  stage: PetStage;
  stageLabel: string;
  stageFrom: number;
  next: { key: PetStage; label: string; from: number } | null;
  streakHours: number;
  bestStreakHours: number;
  petsLeft: number;
}

export interface Needs {
  health: number;
  food: number;
  clean: number;
  energy: number;
  down: number;
  pending: number;
  reclaimGb: number;
  disk: number;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function needsOf(data: AppData, reclaimBytes: number | null, disk: number | null, cpu: number | null): Needs {
  const services = data.services.filter(s => s.isVisible !== false);
  const down = services.filter(s => s.status === 'offline').length;
  const pending = Object.values(data.updates.containers).filter(c => c.state === 'available' || c.state === 'recreate').length;
  const reclaimGb = (reclaimBytes ?? 0) / 1024 ** 3;
  const d = disk ?? 0;
  return {
    health: services.length ? clamp(((services.length - down) / services.length) * 100 - (down ? 20 : 0)) : 100,
    food: clamp(100 - pending * 15),
    clean: clamp(100 - reclaimGb * 25),
    energy: clamp(Math.min(100 - Math.max(0, d - 60) * 2.5, 100 - Math.max(0, (cpu ?? 0) - 50) * 2)),
    down,
    pending,
    reclaimGb,
    disk: d,
  };
}

export function moodOf(n: Needs, night: boolean): PetMood {
  if (n.down > 0) return 'sick';
  if (n.energy < 25) return 'tired';
  if (n.food < 40) return 'hungry';
  if (n.clean < 40) return 'dirty';
  if (night) return 'sleeping';
  return 'happy';
}

export function moodLine(mood: PetMood, n: Needs, name: string): string {
  switch (mood) {
    case 'sick':
      return `Je ne me sens pas bien… ${n.down} service${n.down > 1 ? 's' : ''} ne répond${n.down > 1 ? 'ent' : ''} plus 🤒`;
    case 'tired':
      return n.disk > 85 ? `Je suis épuisé, le disque est plein à ${Math.round(n.disk)} % 😮‍💨` : 'Le serveur tourne à fond, je n’en peux plus 😮‍💨';
    case 'hungry':
      return `J’ai faim ! ${n.pending} mise${n.pending > 1 ? 's' : ''} à jour m’attend${n.pending > 1 ? 'ent' : ''} 🍖`;
    case 'dirty':
      return `Je sens un peu… ${n.reclaimGb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go de poussière Docker 🫧`;
    case 'sleeping':
      return 'Zzz… tout va bien, je dors 🌙';
    case 'eating':
      return 'Miam ! Une image toute fraîche 😋';
    case 'loved':
      return 'Hihi, encore ! 💕';
    case 'bath':
      return 'Ahh, tout propre ! 🛁';
    default:
      return n.pending ? `Tout roule. ${n.pending} petite${n.pending > 1 ? 's' : ''} mise${n.pending > 1 ? 's' : ''} à jour pour le goûter ?` : `Tout roule ! ${name} est aux anges ✨`;
  }
}

export const STAGE_EMOJI: Record<PetStage, string> = { egg: '🥚', baby: '🐣', teen: '🌱', adult: '⭐', legend: '👑' };
