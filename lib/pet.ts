import type { AppData } from '../types';

/**
 * The creature's needs, from live data (components/Pet.tsx):
 *   Santé     share of services online
 *   Satiété   drops 15 points per pending image update (it "eats" updates)
 *   Propreté  drops 25 points per Go that `docker prune` could free
 *   Énergie   falls when the system disk passes 60 % or the CPU runs hot (the media
 *             disk /mnt/nvme is always full by design, so it is not watched)
 * The mood is the most pressing need; at night, with nothing wrong, it sleeps.
 * When a film plays on Jellyfin it watches with popcorn (unless it is sick).
 * A service that keeps falling (two drops or more in its last 30 minutes)
 * makes it sulk. Passing moods come from what you do (petReact): it digs in
 * the bin when a link is restored, bathes then burps after a Docker cleanup,
 * and claps for each week without outage.
 */

export type PetStage = 'egg' | 'baby' | 'teen' | 'adult' | 'legend';
export type PetMood =
  | 'happy'
  | 'sick'
  | 'hungry'
  | 'dirty'
  | 'tired'
  | 'sleeping'
  | 'eating'
  | 'loved'
  | 'bath'
  | 'watching'
  | 'sulky'
  | 'digging'
  | 'burping'
  | 'clapping';

/** Window event other parts of the app send to make it react. */
export const PET_EVENT = 'portail:pet';
export type PetAction = 'bath' | 'eat' | 'dig';

/** E.g. Maintenance after a prune ('bath'), a restored link ('dig'). */
export function petReact(action: PetAction) {
  window.dispatchEvent(new CustomEvent(PET_EVENT, { detail: { action } }));
}

/** Worn on its head or face; each comes from a badge (backend services/pet.ts). */
export type PetAccessory = 'cap' | 'chef' | 'duck' | 'glasses' | 'crown' | 'helmet' | 'glasses3d' | 'bow' | 'cape';

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
  accessory: PetAccessory | null;
}

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

export interface PetLive {
  watching: Watching[];
}

export type PetEventKind = 'birth' | 'sick' | 'healed' | 'meal' | 'indigestion' | 'bath' | 'evolve' | 'badge' | 'movie' | 'dig';

export interface PetEvent {
  id: number;
  at: string;
  kind: PetEventKind;
  title: string;
  detail: string | null;
  meta: Record<string, unknown>;
}

export interface PetBadge {
  key: string;
  icon: string;
  label: string;
  description: string;
  accessory: PetAccessory | null;
  unlockedAt: string | null;
  progress: { value: number; goal: number } | null;
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
  watching: Watching[];
  /** Services that went down twice or more in the last 30 minutes. */
  flapping: string[];
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function needsOf(
  data: AppData,
  reclaimBytes: number | null,
  disk: number | null,
  cpu: number | null,
  watching: Watching[] = [],
): Needs {
  const services = data.services.filter(s => s.isVisible !== false);
  const down = services.filter(s => s.status === 'offline').length;
  const pending = Object.values(data.updates.containers).filter(c => c.state === 'available' || c.state === 'recreate').length;
  const reclaimGb = (reclaimBytes ?? 0) / 1024 ** 3;
  const d = disk ?? 0;
  const flapping = services
    .filter(s => {
      const h = data.health[s.id]?.history ?? [];
      let drops = 0;
      for (let i = 1; i < h.length; i++) if (h[i - 1].up && !h[i].up) drops++;
      return drops >= 2;
    })
    .map(s => s.name);
  return {
    health: services.length ? clamp(((services.length - down) / services.length) * 100 - (down ? 20 : 0)) : 100,
    food: clamp(100 - pending * 15),
    clean: clamp(100 - reclaimGb * 25),
    energy: clamp(Math.min(100 - Math.max(0, d - 60) * 2.5, 100 - Math.max(0, (cpu ?? 0) - 50) * 2)),
    down,
    pending,
    reclaimGb,
    disk: d,
    watching,
    flapping,
  };
}

export function moodOf(n: Needs, night: boolean): PetMood {
  if (n.down > 0) return 'sick';
  if (n.flapping.length) return 'sulky';
  if (n.watching.some(w => !w.paused)) return 'watching';
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
      return n.disk > 85 ? `Je suis épuisé, le disque système est plein à ${Math.round(n.disk)} % 😮‍💨` : 'Le serveur tourne à fond, je n’en peux plus 😮‍💨';
    case 'watching': {
      const w = n.watching.find(x => !x.paused) ?? n.watching[0];
      const more = n.watching.length > 1 ? ` (et ${n.watching.length - 1} autre${n.watching.length > 2 ? 's' : ''} écran${n.watching.length > 2 ? 's' : ''})` : '';
      return `Chut, je regarde ${w.title} avec ${w.user} 🍿${more}`;
    }
    case 'hungry':
      return `J’ai faim ! ${n.pending} mise${n.pending > 1 ? 's' : ''} à jour m’attend${n.pending > 1 ? 'ent' : ''} 🍖`;
    case 'dirty':
      return `Je sens un peu… ${n.reclaimGb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go de poussière Docker 🫧`;
    case 'sleeping':
      return 'Zzz… tout va bien, je dors 🌙';
    case 'sulky': {
      const [first, ...rest] = n.flapping;
      return rest.length
        ? `Hmpf. ${first} et ${rest.length} autre${rest.length > 1 ? 's' : ''} n’arrêtent pas de tomber. Je boude 😤`
        : `Hmpf. ${first} n’arrête pas de tomber. Je boude 😤`;
    }
    case 'digging':
      return 'Attends… je l’ai retrouvé au fond de la poubelle ! 🗑️';
    case 'burping':
      return 'BUUURP ! Pardon. Ça fait de la place 😳';
    case 'clapping':
      return 'Une semaine entière sans panne ! Bravo à nous 👏';
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

export const ACCESSORY_LABEL: Record<PetAccessory, string> = {
  cap: 'Casquette',
  chef: 'Toque',
  duck: 'Canard de bain',
  glasses: 'Lunettes de soleil',
  crown: 'Couronne',
  helmet: 'Casque de chantier',
  glasses3d: 'Lunettes 3D',
  bow: 'Nœud',
  cape: 'Cape',
};
