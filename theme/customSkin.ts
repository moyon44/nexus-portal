import type { CustomSkinConfig, FontKey } from './skins';

/**
 * Studio styles: turns a CustomSkinConfig into CSS variables (--cs-*) and
 * data attributes (data-cs-*) on <html>; styles/skins.css, block
 * html[data-skin="custom"], does the rest. Also the presets, the dice and
 * the share codes.
 */

export const FONTS: Record<FontKey, { label: string; css: string }> = {
  inter: { label: 'Inter', css: '"Inter", sans-serif' },
  geist: { label: 'Geist', css: '"Geist", "Inter", sans-serif' },
  spacemono: { label: 'Space Mono', css: '"Space Mono", monospace' },
  jetbrains: { label: 'JetBrains Mono', css: '"JetBrains Mono", monospace' },
  fredoka: { label: 'Fredoka', css: '"Fredoka", sans-serif' },
  orbitron: { label: 'Orbitron', css: '"Orbitron", sans-serif' },
  caveat: { label: 'Caveat (manuscrit)', css: '"Caveat", cursive' },
  vt323: { label: 'VT323 (pixel)', css: '"VT323", monospace' },
  playfair: { label: 'Playfair (serif)', css: '"Playfair Display", Georgia, serif' },
  tahoma: { label: 'Tahoma', css: 'Tahoma, Verdana, sans-serif' },
};

export const DEFAULT_CUSTOM: CustomSkinConfig = {
  mode: 'dark',
  bg: '#0f1117',
  bg2: '#1e1b4b',
  surface: '#1a1d27',
  text: '#eef0f6',
  accent: '#7c83ff',
  border: '#2a2e3d',
  radius: 14,
  borderWidth: 1,
  shadow: 'soft',
  font: 'inter',
  titleFont: 'geist',
  titleUpper: false,
  titleSpacing: 0,
  ground: 'aurora',
  tile: 'flat',
  hover: 'tilt',
  logos: 'color',
  grain: true,
  vignette: false,
  scanlines: false,
};

/** Starting points in the Studio. */
export const PRESETS: { name: string; config: CustomSkinConfig }[] = [
  { name: 'Minuit', config: DEFAULT_CUSTOM },
  {
    name: 'Pastel',
    config: { ...DEFAULT_CUSTOM, mode: 'light', bg: '#fbf4ee', bg2: '#e9e4ff', surface: '#ffffff', text: '#3a3346', accent: '#ff7eb3', border: '#efe4dc', radius: 22, borderWidth: 0, shadow: 'soft', font: 'fredoka', titleFont: 'fredoka', ground: 'gradient', tile: 'puffy', hover: 'lift', grain: false },
  },
  {
    name: 'Matrice',
    config: { ...DEFAULT_CUSTOM, bg: '#000000', bg2: '#001a00', surface: '#020d02', text: '#00ff66', accent: '#00ff66', border: '#0b4d1f', radius: 0, borderWidth: 1, shadow: 'glow', font: 'vt323', titleFont: 'vt323', titleUpper: true, titleSpacing: 10, ground: 'grid', tile: 'outline', hover: 'invert', logos: 'mono', grain: false, scanlines: true, vignette: true },
  },
  {
    name: 'Gazette',
    config: { ...DEFAULT_CUSTOM, mode: 'light', bg: '#f3efe6', bg2: '#e8e1d2', surface: '#faf8f3', text: '#1c1a17', accent: '#b3261e', border: '#1c1a17', radius: 0, borderWidth: 1, shadow: 'none', font: 'inter', titleFont: 'playfair', titleSpacing: -2, ground: 'noise', tile: 'outline', hover: 'invert', logos: 'ink', grain: true },
  },
  {
    name: 'Néon',
    config: { ...DEFAULT_CUSTOM, bg: '#0a0014', bg2: '#2b0040', surface: '#14002a', text: '#f5e9ff', accent: '#00f0ff', border: '#ff2fd1', radius: 10, borderWidth: 1, shadow: 'glow', font: 'geist', titleFont: 'orbitron', titleUpper: true, titleSpacing: 12, ground: 'dots', tile: 'glass', hover: 'glow', vignette: true },
  },
  {
    name: 'Forêt',
    config: { ...DEFAULT_CUSTOM, mode: 'dark', bg: '#0f1a14', bg2: '#23402e', surface: '#16241c', text: '#e4efe6', accent: '#9bd67f', border: '#2b4234', radius: 18, shadow: 'soft', font: 'inter', titleFont: 'playfair', ground: 'gradient', tile: 'glass', hover: 'lift' },
  },
];

const hex = /^#[0-9a-f]{6}$/i;
const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Anything (a stored config, an imported code) → a complete, safe config. */
export function normalize(raw: unknown): CustomSkinConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CUSTOM;
  const color = (k: keyof CustomSkinConfig) => (typeof c[k] === 'string' && hex.test(c[k] as string) ? (c[k] as string) : (d[k] as string));
  const fonts = Object.keys(FONTS) as FontKey[];
  return {
    mode: pick(c.mode, ['light', 'dark'] as const, d.mode),
    bg: color('bg'),
    bg2: color('bg2'),
    surface: color('surface'),
    text: color('text'),
    accent: color('accent'),
    border: color('border'),
    radius: num(c.radius, 0, 32, d.radius),
    borderWidth: num(c.borderWidth, 0, 4, d.borderWidth),
    shadow: pick(c.shadow, ['none', 'soft', 'hard', 'glow'] as const, d.shadow),
    font: pick(c.font, fonts, d.font),
    titleFont: pick(c.titleFont, fonts, d.titleFont),
    titleUpper: c.titleUpper === true,
    titleSpacing: num(c.titleSpacing, -5, 30, d.titleSpacing),
    ground: pick(c.ground, ['solid', 'gradient', 'dots', 'grid', 'aurora', 'noise'] as const, d.ground),
    tile: pick(c.tile, ['flat', 'glass', 'outline', 'puffy'] as const, d.tile),
    hover: pick(c.hover, ['lift', 'tilt', 'glow', 'invert', 'none'] as const, d.hover),
    logos: pick(c.logos, ['color', 'mono', 'ink'] as const, d.logos),
    grain: c.grain === true,
    vignette: c.vignette === true,
    scanlines: c.scanlines === true,
  };
}

/** CSS variables and data attributes for <html>. */
export function customVars(c: CustomSkinConfig): { vars: Record<string, string>; attrs: Record<string, string> } {
  return {
    vars: {
      '--cs-bg': c.bg,
      '--cs-bg2': c.bg2,
      '--cs-surface': c.surface,
      '--cs-text': c.text,
      '--cs-accent': c.accent,
      '--cs-border': c.border,
      '--cs-radius': `${c.radius}px`,
      '--cs-bw': `${c.borderWidth}px`,
      '--cs-font': FONTS[c.font].css,
      '--cs-title-font': FONTS[c.titleFont].css,
      '--cs-title-transform': c.titleUpper ? 'uppercase' : 'none',
      '--cs-title-spacing': `${c.titleSpacing / 100}em`,
    },
    attrs: {
      'data-cs-ground': c.ground,
      'data-cs-tile': c.tile,
      'data-cs-hover': c.hover,
      'data-cs-logos': c.logos,
      'data-cs-shadow': c.shadow,
      'data-cs-fx': [c.grain && 'grain', c.vignette && 'vignette', c.scanlines && 'scanlines'].filter(Boolean).join(' '),
    },
  };
}

export const CUSTOM_ATTRS = ['data-cs-ground', 'data-cs-tile', 'data-cs-hover', 'data-cs-logos', 'data-cs-shadow', 'data-cs-fx'];
export const CUSTOM_VARS = Object.keys(customVars(DEFAULT_CUSTOM).vars);

/* ---- Dice ---------------------------------------------------------------- */

const rand = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const hsl = (h: number, s: number, l: number) => {
  // → #rrggbb
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
};

/** A random style that still reads: harmonious hues, enough contrast. */
export function randomConfig(): CustomSkinConfig {
  const dark = Math.random() < 0.6;
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + rand([30, 60, 150, 180, 210])) % 360;
  const tint = rand([8, 14, 22]);
  return normalize({
    mode: dark ? 'dark' : 'light',
    bg: dark ? hsl(h, tint + 10, 7) : hsl(h, tint + 20, 95),
    bg2: dark ? hsl(h2, 45, 18) : hsl(h2, 70, 88),
    surface: dark ? hsl(h, tint + 8, 12) : hsl(h, tint + 10, 99),
    text: dark ? hsl(h, 20, 93) : hsl(h, 25, 14),
    accent: hsl(h2, rand([70, 85, 95]), dark ? 65 : 52),
    border: dark ? hsl(h, tint, 22) : hsl(h, tint + 5, 86),
    radius: rand([0, 4, 10, 14, 20, 28]),
    borderWidth: rand([0, 1, 1, 2]),
    shadow: rand(['none', 'soft', 'soft', 'hard', 'glow'] as const),
    font: rand(['inter', 'geist', 'spacemono', 'fredoka', 'jetbrains'] as const),
    titleFont: rand(['geist', 'playfair', 'orbitron', 'fredoka', 'spacemono', 'inter'] as const),
    titleUpper: Math.random() < 0.35,
    titleSpacing: rand([-2, 0, 0, 6, 12]),
    ground: rand(['solid', 'gradient', 'dots', 'grid', 'aurora', 'noise'] as const),
    tile: rand(['flat', 'glass', 'outline', 'puffy'] as const),
    hover: rand(['lift', 'tilt', 'glow', 'invert'] as const),
    logos: rand(['color', 'color', 'mono', 'ink'] as const),
    grain: Math.random() < 0.5,
    vignette: Math.random() < 0.3,
    scanlines: Math.random() < 0.1,
  });
}

/* ---- Share codes: NEXUS-<base64url of the JSON> ---------------------------- */

export function encodeSkin(name: string, config: CustomSkinConfig): string {
  const json = JSON.stringify({ n: name, c: config });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `NEXUS-${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeSkin(code: string): { name: string; config: CustomSkinConfig } | null {
  const m = code.trim().match(/^NEXUS-([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const name = typeof data?.n === 'string' ? data.n.slice(0, 64) : 'Style importé';
    return { name, config: normalize(data?.c) };
  } catch {
    return null;
  }
}
