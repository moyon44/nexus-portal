import { createContext, useContext } from 'react';
import type { Service } from '../types';

/**
 * App-wide UI actions, provided by the shell (App.tsx) so the sidebar, the
 * home page, the tile menu, the palette and the keyboard shortcuts all drive
 * the same dialogs.
 */
export interface ShellApi {
  openPalette: () => void;
  openQuickAdd: (opts?: { url?: string; folderId?: string; name?: string; container?: string }) => void;
  /** The "Ajouter" button hands its view-transition name to the open dialog. */
  quickAddOpen: boolean;
  openDetails: (service: Service) => void;
  /** Shows a message in the Dynamic Island (queued). */
  notify: (message: string, tone?: 'ok' | 'err' | 'info', extra?: { service?: Service; onClick?: () => void }) => void;
  /** Scrolls the home page to a category section (navigating home first). */
  goToCategory: (id: string) => void;
  /** Category whose section is currently at the top of the home page. */
  activeCategory: string | null;
  setActiveCategory: (id: string | null) => void;
  /** Home page shows only services that are down. */
  issuesOnly: boolean;
  setIssuesOnly: (value: boolean) => void;
  /** Id of the link just added, highlighted for a moment. */
  justAdded: string | null;
  /** Link hovered in the sidebar tree; its tile lights up. */
  hoveredLink: Service | null;
  setHoveredLink: (service: Service | null) => void;
  /** Late at night (23 h–6 h) the home page shows only the favourites. */
  nightFocus: boolean;
  /** false: show everything until the next night. */
  setNightFocus: (value: boolean) => void;
  /** Display style of the home page (per device). */
  view: ViewMode;
  setView: (view: ViewMode) => void;
}

export type ViewMode = 'cards' | 'list' | 'icons' | 'bento' | 'text';

export const VIEWS: { key: ViewMode; label: string }[] = [
  { key: 'cards', label: 'Cartes' },
  { key: 'list', label: 'Liste' },
  { key: 'icons', label: 'Icônes' },
  { key: 'bento', label: 'Bento' },
  { key: 'text', label: 'Texte' },
];

const VIEW_KEY = 'portail:view';

export function readView(): ViewMode {
  try {
    const v = window.localStorage.getItem(VIEW_KEY) as ViewMode | null;
    return v && VIEWS.some(x => x.key === v) ? v : 'cards';
  } catch {
    return 'cards';
  }
}

export function saveView(view: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Kept for this page load only.
  }
}

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export function dayPart(date = new Date()): DayPart {
  const h = date.getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 18) return 'day';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

/** Per-device switch (Admin → Thème): the night focus is on unless turned off. */
export const NIGHT_FOCUS_KEY = 'portail:night-focus';
const NIGHT_DISMISS_KEY = 'portail:night-focus-dismissed';

export function nightFocusEnabled(): boolean {
  try {
    return window.localStorage.getItem(NIGHT_FOCUS_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** The night the focus was dismissed, as the date it started (YYYY-MM-DD). */
export function nightKey(date = new Date()): string {
  const d = new Date(date);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function nightDismissed(): boolean {
  try {
    return window.localStorage.getItem(NIGHT_DISMISS_KEY) === nightKey();
  } catch {
    return false;
  }
}

export function dismissNight() {
  try {
    window.localStorage.setItem(NIGHT_DISMISS_KEY, nightKey());
  } catch {
    // Dismissed for this page load only.
  }
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside the app shell');
  return ctx;
}

export const sectionId = (categoryId: string) => `section-${categoryId}`;
