/**
 * Folder (category) colours. Categories store a Tailwind class such as
 * `bg-purple-500` or `text-blue-500`; the tree and the admin only need the
 * hue, turned into the design system's colour variable.
 */

export const FOLDER_HUES = [
  'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'neutral',
] as const;

export type FolderHue = (typeof FOLDER_HUES)[number];

/**
 * Admin swatches. Stored as `bg-<hue>-500`, the format the database already
 * uses. Red is left out on purpose: it is reserved for outages.
 */
export const FOLDER_SWATCHES: { value: string; hue: FolderHue; className: string }[] = [
  { value: 'bg-orange-500', hue: 'orange', className: 'bg-orange-500' },
  { value: 'bg-yellow-500', hue: 'yellow', className: 'bg-yellow-500' },
  { value: 'bg-lime-500', hue: 'lime', className: 'bg-lime-500' },
  { value: 'bg-green-500', hue: 'green', className: 'bg-green-500' },
  { value: 'bg-teal-500', hue: 'teal', className: 'bg-teal-500' },
  { value: 'bg-cyan-500', hue: 'cyan', className: 'bg-cyan-500' },
  { value: 'bg-blue-500', hue: 'blue', className: 'bg-blue-500' },
  { value: 'bg-indigo-500', hue: 'indigo', className: 'bg-indigo-500' },
  { value: 'bg-purple-500', hue: 'purple', className: 'bg-purple-500' },
  { value: 'bg-pink-500', hue: 'pink', className: 'bg-pink-500' },
  { value: 'bg-neutral-500', hue: 'neutral', className: 'bg-neutral-500' },
];

export function folderHue(color: string | undefined): FolderHue {
  const m = color?.match(/(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-\d+/);
  const hue = m?.[1];
  if (!hue) return 'neutral';
  if (['gray', 'slate', 'zinc', 'stone'].includes(hue)) return 'neutral';
  const aliases: Record<string, FolderHue> = { amber: 'orange', emerald: 'green', sky: 'cyan', violet: 'purple', fuchsia: 'pink', rose: 'pink' };
  return (aliases[hue] ?? hue) as FolderHue;
}

/** The folder's colour as a CSS value (500 step, like the admin swatch). */
export function folderColor(color: string | undefined): string {
  return `var(--color-${folderHue(color)}-500)`;
}

/**
 * The folder's pastel tint for dots and section markers: the 300 step pulled
 * toward neutral, so categories read as soft labels and never compete with
 * the accent or with the red of an outage. A legacy red folder shows as rose.
 */
export function folderTint(color: string | undefined): string {
  const hue = folderHue(color);
  const step = hue === 'red' ? 'var(--color-pink-300)' : `var(--color-${hue}-300)`;
  return `color-mix(in oklch, ${step} 75%, var(--color-neutral-400))`;
}

/** Next colour for a new folder: the first hue no folder uses yet. */
export function nextFolderColor(used: (string | undefined)[]): string {
  const taken = new Set(used.map(folderHue));
  return (FOLDER_SWATCHES.find(s => !taken.has(s.hue)) ?? FOLDER_SWATCHES[0]).value;
}
