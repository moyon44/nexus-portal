/**
 * Visual styles ("skins"). Each one is a block of index.css scoped to
 * html[data-skin="<key>"]; this list is what the Admin, the palette, the
 * store and theme.ts agree on.
 *
 * `mode` forces light or dark (the skin has its own palette); `ownAccent`
 * means the accent colour picked in Admin → Thème is ignored.
 */
export type BuiltinSkin = 'default' | 'paper' | 'terminal' | 'glass' | 'blueprint' | 'brutal' | 'synthwave' | 'win98' | 'clay';
/** A built-in style, or one made in the Studio ('custom:<uuid>'). */
export type Skin = BuiltinSkin | `custom:${string}`;

export interface SkinInfo {
  key: Skin;
  label: string;
  hint: string;
  mode?: 'light' | 'dark';
  ownAccent?: boolean;
  /** Colours of the little preview in the Admin picker: ground, card, ink. */
  swatch: [string, string, string];
}

export const SKINS: SkinInfo[] = [
  { key: 'default', label: 'Standard', hint: 'Le style BoardUI, en clair ou en sombre, avec ta couleur d’accent.', swatch: ['#121212', '#1f1f1f', '#51617b'] },
  { key: 'paper', label: 'Papier', hint: 'Papier crème, pilules kraft, logos à l’encre, doodles et lettres qui tremblent. Toujours en clair.', mode: 'light', ownAccent: true, swatch: ['#f1eadb', '#ddcfb0', '#1d1a14'] },
  { key: 'terminal', label: 'Terminal', hint: 'Écran cathodique vert phosphore : lignes de balayage, écran bombé, démarrage façon BIOS, palette en ligne de commande. Toujours en sombre.', mode: 'dark', ownAccent: true, swatch: ['#020a04', '#04170a', '#33ff77'] },
  { key: 'glass', label: 'Verre liquide', hint: 'Tuiles en verre qui déforment ce qu’il y a derrière (Chrome et Edge ; flou simple ailleurs). Suit le mode et l’accent.', swatch: ['#1b1440', '#ffffff40', '#8ab4ff'] },
  { key: 'blueprint', label: 'Plan', hint: 'Plan d’architecte : fond bleu quadrillé, traits blancs, repères numérotés, cotes au survol et cartouche. Toujours en sombre.', mode: 'dark', ownAccent: true, swatch: ['#123f7a', '#174a8c', '#e8f1ff'] },
  { key: 'brutal', label: 'Brutaliste', hint: 'Bordures épaisses, ombres décalées, typo monospace énorme, couleurs franches. Toujours en clair.', mode: 'light', ownAccent: true, swatch: ['#f4f0e6', '#ffe14d', '#000000'] },
  { key: 'win98', label: 'Windows 98', hint: 'Bureau sarcelle, fenêtres grises en relief, barres de titre bleues, barre des tâches avec menu Démarrer, écran bleu pour les pannes. Toujours en clair.', mode: 'light', ownAccent: true, swatch: ['#008080', '#c0c0c0', '#000080'] },
  { key: 'clay', label: 'Pâte à modeler', hint: 'Tuiles bombées couleur pastel qui s’écrasent au clic et rebondissent, logos moulés en relief, boules de pâte en fond. Toujours en clair.', mode: 'light', ownAccent: true, swatch: ['#f6eee6', '#ffd6e0', '#8b6cf0'] },
  { key: 'synthwave', label: 'Synthwave', hint: 'Grille néon en perspective, soleil rayé, titres chromés. Toujours en sombre.', mode: 'dark', ownAccent: true, swatch: ['#1a0633', '#2a0b4d', '#ff3ec8'] },
];

/* ---- Styles made in the Studio (components/Studio.tsx) ------------------ */

export type FontKey = 'inter' | 'geist' | 'spacemono' | 'jetbrains' | 'fredoka' | 'orbitron' | 'caveat' | 'vt323' | 'playfair' | 'tahoma';

export interface CustomSkinConfig {
  mode: 'light' | 'dark';
  /** Ground, second ground colour (gradients, aurora), cards, text, accent, borders. */
  bg: string;
  bg2: string;
  surface: string;
  text: string;
  accent: string;
  border: string;
  /** px */
  radius: number;
  borderWidth: number;
  shadow: 'none' | 'soft' | 'hard' | 'glow';
  font: FontKey;
  titleFont: FontKey;
  titleUpper: boolean;
  /** Letter spacing of titles, in hundredths of an em. */
  titleSpacing: number;
  ground: 'solid' | 'gradient' | 'dots' | 'grid' | 'aurora' | 'noise';
  tile: 'flat' | 'glass' | 'outline' | 'puffy';
  hover: 'lift' | 'tilt' | 'glow' | 'invert' | 'none';
  logos: 'color' | 'mono' | 'ink';
  grain: boolean;
  vignette: boolean;
  scanlines: boolean;
}

export interface CustomSkin {
  id: string;
  name: string;
  config: CustomSkinConfig;
}

/** Kept in step with the store (setCustomSkins), so skinInfo can describe them. */
let customs: CustomSkin[] = [];
export function setCustomSkins(list: CustomSkin[]) {
  customs = list;
}
export const customSkinOf = (key: string | undefined): CustomSkin | undefined =>
  key?.startsWith('custom:') ? customs.find(c => `custom:${c.id}` === key) : undefined;

const customInfo = (c: CustomSkin): SkinInfo => ({
  key: `custom:${c.id}`,
  label: c.name,
  hint: 'Style créé dans le Studio. Clique sur le crayon pour le modifier.',
  mode: c.config.mode,
  ownAccent: true,
  swatch: [c.config.bg, c.config.surface, c.config.accent],
});

export const skinInfo = (key: string | undefined): SkinInfo => {
  const custom = customSkinOf(key);
  if (custom) return customInfo(custom);
  return SKINS.find(s => s.key === key) ?? SKINS[0];
};

/** Built-in styles, then the Studio ones. */
export const allSkins = (list: CustomSkin[] = customs): SkinInfo[] => [...SKINS, ...list.map(customInfo)];

export const isSkin = (v: unknown): v is Skin =>
  typeof v === 'string' && (SKINS.some(s => s.key === v) || /^custom:[0-9a-f-]{36}$/.test(v));
