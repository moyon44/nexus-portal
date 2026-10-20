import { useEffect, useState } from 'react';
import type { Service } from '../types';
import { dashboardIconUrl, useIconIndex } from './icons';
import { isGithubAvatar } from './github';

/**
 * A tile's brand colour, read from its logo: the image is drawn small on a
 * canvas and the most vivid, most present hue wins (greys, near-white and
 * near-black pixels are ignored). The colour is then brought to a readable
 * lightness so it works as a tint in both themes.
 *
 * Only CORS-readable images can be sampled (dashboard-icons on jsDelivr);
 * favicons from other sites taint the canvas and fall back to the accent.
 * Results are cached per image URL in localStorage.
 */

const CACHE_KEY = 'portail:brand-colors';
const memory = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function readCache(): Record<string, string | null> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(src: string, color: string | null) {
  try {
    const all = readCache();
    all[src] = color;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // Cached in memory only.
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function sample(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // 24 hue buckets, weighted by saturation and opacity.
        const buckets = Array.from({ length: 24 }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.5) continue;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          if (s < 0.25 || l < 0.12 || l > 0.92) continue;
          const w = s * a * (1 - Math.abs(l - 0.5));
          const b = buckets[Math.floor(h / 15) % 24];
          b.w += w;
          b.h += h * w;
          b.s += s * w;
          b.l += l * w;
        }
        const best = buckets.reduce((m, b) => (b.w > m.w ? b : m));
        if (best.w < 1.5) return resolve(null); // monochrome logo
        const h = Math.round(best.h / best.w);
        const s = Math.round(Math.min(90, Math.max(55, (best.s / best.w) * 100)));
        const l = Math.round(Math.min(66, Math.max(52, (best.l / best.w) * 100)));
        resolve(`hsl(${h} ${s}% ${l}%)`);
      } catch {
        resolve(null); // tainted canvas (no CORS)
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function brandColorOf(src: string): Promise<string | null> {
  if (memory.has(src)) return Promise.resolve(memory.get(src)!);
  const cached = readCache();
  if (src in cached) {
    memory.set(src, cached[src]);
    return Promise.resolve(cached[src]);
  }
  if (!pending.has(src)) {
    pending.set(
      src,
      sample(src).then(color => {
        memory.set(src, color);
        writeCache(src, color);
        pending.delete(src);
        return color;
      }),
    );
  }
  return pending.get(src)!;
}

/** The logo URL a tile shows (official logo first), for sampling and the ambient glow. */
export function useLogoSrc(service: Pick<Service, 'name' | 'icon' | 'customImage'>): string | null {
  const idx = useIconIndex();
  if (isGithubAvatar(service.customImage)) return service.customImage!;
  return dashboardIconUrl({ name: service.name, icon: service.icon }, idx) ?? service.customImage ?? null;
}

export function useBrandColor(src: string | null): string | null {
  const [color, setColor] = useState<string | null>(() => (src && memory.has(src) ? memory.get(src)! : null));
  useEffect(() => {
    if (!src) {
      setColor(null);
      return;
    }
    let alive = true;
    brandColorOf(src).then(c => alive && setColor(c));
    return () => {
      alive = false;
    };
  }, [src]);
  return color;
}
