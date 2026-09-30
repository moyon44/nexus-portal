import { useSyncExternalStore } from 'react';
import qrcode from 'qrcode-generator';

/**
 * Which tile is turned over (one at a time). Tiles, their right-click menu
 * and the keyboard all flip through here.
 */
let flipped: string | null = null;
const listeners = new Set<() => void>();

export function setFlipped(id: string | null) {
  if (flipped === id) return;
  flipped = id;
  listeners.forEach(l => l());
}

export const toggleFlipped = (id: string) => setFlipped(flipped === id ? null : id);

/** The tile can be turned over (card views only). */
export const canFlip = (id: string) => !!document.querySelector(`[data-flippable="${CSS.escape(id)}"]`);

export function useFlipped(id: string): boolean {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => flipped === id,
  );
}

/** QR code of `text` as one SVG path (one unit per module) and its size. */
export function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      // Merge runs of dark modules on a row into one rectangle.
      let w = 1;
      while (c + w < n && qr.isDark(r, c + w)) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  return { d, size: n };
}
