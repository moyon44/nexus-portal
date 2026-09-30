import type { Tone } from '../components/ui/widget';

/**
 * Home Assistant values for display (pages/HomeAssistant.tsx, the widgets in
 * components/ha/): French numbers and units, binary sensors named by what
 * they watch, a tone for gauges and states.
 */

type Shown = { domain: string; state: string; unit: string | null; deviceClass: string | null };

export const DEAD = new Set(['unavailable', 'unknown']);

const BINARY: Record<string, [string, string]> = {
  door: ['Ouverte', 'Fermée'],
  window: ['Ouverte', 'Fermée'],
  opening: ['Ouvert', 'Fermé'],
  garage_door: ['Ouverte', 'Fermée'],
  motion: ['Mouvement', 'Calme'],
  occupancy: ['Occupé', 'Libre'],
  presence: ['Présent', 'Absent'],
  moisture: ['Humide', 'Sec'],
  lock: ['Déverrouillé', 'Verrouillé'],
  battery: ['Faible', 'OK'],
  connectivity: ['Connecté', 'Déconnecté'],
  plug: ['Branché', 'Débranché'],
  power: ['Allumé', 'Éteint'],
  problem: ['Problème', 'OK'],
  running: ['En marche', 'Arrêté'],
};

const WORDS: Record<string, string> = {
  on: 'Allumé',
  off: 'Éteint',
  home: 'À la maison',
  not_home: 'Absent',
  open: 'Ouvert',
  closed: 'Fermé',
  opening: 'Ouverture…',
  closing: 'Fermeture…',
  locked: 'Verrouillé',
  unlocked: 'Déverrouillé',
  docked: 'À la base',
  cleaning: 'Nettoie',
  returning: 'Retour à la base',
  idle: 'Au repos',
  paused: 'En pause',
  playing: 'Lecture',
  heat: 'Chauffe',
  // Weather entities
  sunny: 'Ensoleillé',
  'clear-night': 'Nuit claire',
  partlycloudy: 'Éclaircies',
  cloudy: 'Nuageux',
  fog: 'Brouillard',
  rainy: 'Pluie',
  pouring: 'Averses',
  lightning: 'Orage',
  'lightning-rainy': 'Orage',
  snowy: 'Neige',
  windy: 'Venteux',
};

export const isNumber = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));

export const number = (n: number, digits = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits });

export const withUnit = (value: string, unit: string | null) => (unit ? `${value}${unit === '%' ? ' %' : ` ${unit}`}` : value);

export function formatValue(e: Shown): string {
  if (e.state === 'unavailable') return 'Indisponible';
  if (e.state === 'unknown') return 'Inconnu';
  if (e.domain === 'binary_sensor') {
    const [on, off] = BINARY[e.deviceClass ?? ''] ?? ['Activé', 'Désactivé'];
    return e.state === 'on' ? on : off;
  }
  if (e.deviceClass === 'timestamp') {
    const d = new Date(e.state);
    return Number.isNaN(d.getTime()) ? e.state : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (isNumber(e.state)) return withUnit(number(Number(e.state)), e.unit);
  return withUnit(WORDS[e.state] ?? e.state, e.unit);
}

/** Green when all is well, amber when something is open or low, red on trouble. */
export function toneOf(e: Shown): Tone {
  if (DEAD.has(e.state)) return 'idle';
  if (e.domain === 'binary_sensor') {
    if (e.state !== 'on') return e.deviceClass === 'connectivity' ? 'err' : 'ok';
    if (['problem', 'moisture', 'smoke', 'gas', 'safety', 'battery'].includes(e.deviceClass ?? '')) return 'err';
    if (['door', 'window', 'opening', 'garage_door', 'lock'].includes(e.deviceClass ?? '')) return 'warn';
    return 'ok';
  }
  if (e.domain === 'person' || e.domain === 'device_tracker') return e.state === 'home' ? 'ok' : 'idle';
  if (e.domain === 'lock') return e.state === 'locked' ? 'ok' : 'warn';
  if (e.domain === 'cover') return e.state === 'closed' ? 'ok' : 'warn';
  if (e.unit === '%' && isNumber(e.state)) {
    const v = Number(e.state);
    // A battery is worrying when low; a disk or a tank when full.
    if (e.deviceClass === 'battery') return v < 15 ? 'err' : v < 30 ? 'warn' : 'ok';
    if (e.deviceClass === 'humidity') return v > 70 || v < 30 ? 'warn' : 'ok';
    return v > 90 ? 'err' : v > 80 ? 'warn' : 'ok';
  }
  return ['on', 'open', 'unlocked', 'playing', 'cleaning'].includes(e.state) ? 'ok' : 'idle';
}

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

const MEASURE: Record<string, string> = {
  temperature: 'Température',
  humidity: 'Humidité',
  carbon_dioxide: 'CO₂',
  pm25: 'Particules PM2,5',
  illuminance: 'Luminosité',
  pressure: 'Pression',
  power: 'Puissance',
  energy: 'Énergie',
  battery: 'Batterie',
};

/** In a room, what a sensor measures says it best ("Humidité"), else its short name. */
export function roomLabel(e: { name: string; deviceClass: string | null }, title: string, siblings: { deviceClass: string | null }[]) {
  const measure = MEASURE[e.deviceClass ?? ''];
  // Two thermometers in one room: the names tell them apart.
  const alone = siblings.filter(s => s.deviceClass === e.deviceClass).length === 1;
  return measure && alone ? measure : shortName(e.name, title);
}

/** Drops the words a name shares with its widget's title ("Salon Température" in "Salon" → "Température"). */
export function shortName(name: string, title: string) {
  const skip = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const kept = name.split(/\s+/).filter(w => !skip.has(w.toLowerCase()));
  return kept.length ? kept.join(' ') : name;
}

/** Entities a control widget can hold, and what can be done with each. */
export const CONTROL_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'script', 'scene', 'button', 'input_button', 'cover', 'lock', 'vacuum'];

/** Needs a second click: opens something to the outside or costs money. */
export const sensitive = (id: string) => id.startsWith('lock.') || /portail|garage|chauffe|alarm|alarme/.test(id);
