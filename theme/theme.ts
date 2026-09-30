import type { ThemeConfig } from '../types';
import { customSkinOf, skinInfo, type CustomSkinConfig } from './skins';
import { CUSTOM_ATTRS, CUSTOM_VARS, customVars } from './customSkin';

/**
 * Bridges the portal's stored theme (mode + primary colour, edited in
 * Admin → Thème) to the BoardUI tokens in styles/theme.css.
 *
 * The primary colour becomes the whole accent ramp (--color-accent-50…950),
 * the same recipe Jellydash uses for a custom hex (lib/theme-colors.ts): the
 * hex stands in for step 500 and the other steps mix toward white or black.
 * Everything built on accent-* (primary buttons, selected nav item, focus
 * ring, segmented controls) re-tints at once.
 *
 * Mode and variables are cached in localStorage so index.html can re-apply
 * them before first paint.
 */

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const HEX_RAMP: Record<(typeof STEPS)[number], [number, 'white' | 'black'] | null> = {
  50: [10, 'white'],
  100: [20, 'white'],
  200: [38, 'white'],
  300: [58, 'white'],
  400: [78, 'white'],
  500: null,
  600: [85, 'black'],
  700: [70, 'black'],
  800: [55, 'black'],
  900: [42, 'black'],
  950: [28, 'black'],
};

const MODE_KEY = 'portail:theme-mode';
const VARS_KEY = 'portail:theme-vars';
const SKIN_KEY = 'portail:theme-skin';
const CUSTOM_KEY = 'portail:theme-custom';

/** Stored instead of a hex to keep the design system's own blue accent. */
export const DEFAULT_ACCENT = 'default';
/** Approximation of BoardUI's accent-500, for the colour input. */
export const DEFAULT_ACCENT_HEX = '#2b7fff';

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

export function accentVars(hex: string | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!hex || !isHex(hex)) return vars;
  for (const step of STEPS) {
    const mix = HEX_RAMP[step];
    vars[`--color-accent-${step}`] = mix
      ? `color-mix(in oklch, ${hex} ${mix[0]}%, ${mix[1]})`
      : hex;
  }
  return vars;
}

export function resolveDark(mode: ThemeConfig['mode']): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies mode + accent to <html> and caches them for the next load. */
export function applyTheme(theme: Pick<ThemeConfig, 'mode' | 'primaryColor' | 'skin'>) {
  const custom = customSkinOf(theme.skin);
  if (custom) {
    applyCustom(custom.config, true);
    return;
  }
  const root = document.documentElement;
  clearCustom();
  // Skins other than the default bring their own palette (index.css), and
  // most of them force light or dark.
  const skin = skinInfo(theme.skin);
  const current = root.dataset.skin ?? 'default';
  if (current !== skin.key) {
    root.classList.add('theme-transitioning');
    window.requestAnimationFrame(() => root.classList.remove('theme-transitioning'));
  }
  if (skin.key !== 'default') root.dataset.skin = skin.key;
  else delete root.dataset.skin;
  const dark = skin.mode ? skin.mode === 'dark' : resolveDark(theme.mode);
  setDark(dark);
  const vars = skin.ownAccent ? {} : accentVars(theme.primaryColor);
  setAccent(vars);

  try {
    window.localStorage.setItem(MODE_KEY, theme.mode);
    window.localStorage.setItem(SKIN_KEY, skin.key);
    window.localStorage.setItem(VARS_KEY, JSON.stringify(vars));
    window.localStorage.removeItem(CUSTOM_KEY);
  } catch {
    // Storage unavailable: the theme still applies once data loads.
  }
}

/**
 * A Studio style (html[data-skin="custom"] + --cs-* variables). The Studio
 * calls it on every change with `persist` false (a draft); applyTheme with
 * true, which also caches it for the pre-paint script in index.html.
 */
export function applyCustom(config: CustomSkinConfig, persist = false) {
  const root = document.documentElement;
  if (root.dataset.skin !== 'custom') {
    root.classList.add('theme-transitioning');
    window.requestAnimationFrame(() => root.classList.remove('theme-transitioning'));
  }
  root.dataset.skin = 'custom';
  setDark(config.mode === 'dark');
  const { vars, attrs } = customVars(config);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
  const accent = accentVars(config.accent);
  setAccent(accent);
  if (!persist) return;
  try {
    window.localStorage.setItem(SKIN_KEY, 'custom');
    window.localStorage.setItem(VARS_KEY, JSON.stringify(accent));
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify({ mode: config.mode, vars, attrs }));
  } catch {
    // Applies once data loads.
  }
}

function clearCustom() {
  const root = document.documentElement;
  for (const k of CUSTOM_VARS) root.style.removeProperty(k);
  for (const k of CUSTOM_ATTRS) root.removeAttribute(k);
}

function setDark(dark: boolean) {
  const root = document.documentElement;
  if (root.classList.contains('dark') === dark) return;
  // Freeze component transitions for one frame so the palette swaps at once.
  root.classList.add('theme-transitioning');
  root.classList.toggle('dark', dark);
  window.requestAnimationFrame(() => root.classList.remove('theme-transitioning'));
}

function setAccent(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const step of STEPS) {
    const name = `--color-accent-${step}`;
    if (vars[name]) root.style.setProperty(name, vars[name]);
    else root.style.removeProperty(name);
  }
}
