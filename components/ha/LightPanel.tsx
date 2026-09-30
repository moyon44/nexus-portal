import React, { useEffect, useRef, useState } from 'react';
import { haApi } from '../../api';
import { useShell } from '../../lib/shell';
import type { HaLive } from '../../types';
import { cx } from '../../utils/cx';

/**
 * A light's settings, under its row in a control widget: brightness, then a
 * colour (swatches or any colour) and / or a white from warm to cool,
 * depending on what the light supports. Sliders send when you let go.
 */

const COLOR_MODES = ['rgb', 'rgbw', 'rgbww', 'xy', 'hs'];

const SWATCHES: { label: string; rgb: [number, number, number] }[] = [
  { label: 'Rouge', rgb: [255, 40, 40] },
  { label: 'Orange', rgb: [255, 130, 20] },
  { label: 'Jaune', rgb: [255, 210, 40] },
  { label: 'Vert', rgb: [60, 220, 90] },
  { label: 'Cyan', rgb: [40, 210, 230] },
  { label: 'Bleu', rgb: [50, 90, 255] },
  { label: 'Violet', rgb: [150, 70, 255] },
  { label: 'Rose', rgb: [255, 80, 180] },
];

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/** Approximate colour of a white at `k` kelvins, for the slider and the swatch. */
export function kelvinRgb(k: number): [number, number, number] {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  return [r, g, b].map(c => Math.round(Math.min(255, Math.max(0, c)))) as [number, number, number];
}

export const supportsColor = (e: HaLive) => !!e.colorModes?.some(m => COLOR_MODES.includes(m));
export const supportsWhite = (e: HaLive) => !!e.colorModes?.includes('color_temp');
export const dimmable = (e: HaLive) => !!e.colorModes?.some(m => m !== 'onoff');

/** What the light looks like now, for its swatch. */
export function lightColor(e: HaLive): string | null {
  if (e.state !== 'on') return null;
  if (e.rgb) return hex(e.rgb);
  if (e.kelvin) return hex(kelvinRgb(e.kelvin));
  return '#ffd27a';
}

export function LightPanel({ e, onChanged }: { e: HaLive; onChanged: () => void }) {
  const { notify } = useShell();
  const [brightness, setBrightness] = useState(e.brightness ? Math.max(1, Math.round((e.brightness / 255) * 100)) : 100);
  const minK = e.minKelvin ?? 2000;
  const maxK = e.maxKelvin ?? 6500;
  const [kelvin, setKelvin] = useState(e.kelvin ?? Math.round((minK + maxK) / 2));
  const [busy, setBusy] = useState(false);
  const colorInput = useRef<HTMLInputElement>(null);
  const pick = useRef(0);

  // Follow the light when it changes elsewhere, but not while a slider is held.
  const holding = useRef(false);
  useEffect(() => {
    if (holding.current) return;
    if (e.brightness) setBrightness(Math.max(1, Math.round((e.brightness / 255) * 100)));
    if (e.kelvin) setKelvin(e.kelvin);
  }, [e.brightness, e.kelvin]);

  const send = async (extra: { brightness?: number; rgb?: [number, number, number]; kelvin?: number }) => {
    setBusy(true);
    try {
      await haApi.control(e.id, 'set', extra);
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Commande impossible', 'err');
    } finally {
      setBusy(false);
    }
  };

  // Range inputs: value while dragging, send on release (pointer or keyboard).
  const release = (fn: () => void) => ({
    onPointerDown: () => (holding.current = true),
    onPointerUp: () => ((holding.current = false), fn()),
    onKeyUp: (ev: React.KeyboardEvent) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(ev.key) && fn(),
  });

  const current = e.rgb ? hex(e.rgb) : '#ffffff';
  const warm = hex(kelvinRgb(minK));
  const mid = hex(kelvinRgb((minK + maxK) / 2));
  const cool = hex(kelvinRgb(maxK));

  return (
    <div className={cx('flex flex-col gap-3 rounded-xl bg-background-tertiary-default/60 p-3', busy && 'opacity-70')}>
      {dimmable(e) && (
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-caption-1-regular text-text-tertiary">
            <span>Luminosité</span>
            <span className="tabular-nums">{brightness} %</span>
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={brightness}
            onChange={ev => setBrightness(Number(ev.target.value))}
            {...release(() => send({ brightness }))}
            className="w-full accent-accent-400"
            aria-label="Luminosité"
          />
        </label>
      )}

      {supportsColor(e) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-caption-1-regular text-text-tertiary">Couleur</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map(s => (
              <button
                key={s.label}
                type="button"
                title={s.label}
                aria-label={s.label}
                disabled={busy}
                onClick={() => send({ rgb: s.rgb })}
                className="size-7 cursor-pointer rounded-full border border-black/10 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                style={{ backgroundColor: hex(s.rgb) }}
              />
            ))}
            <button
              type="button"
              title="Autre couleur"
              aria-label="Autre couleur"
              onClick={() => colorInput.current?.click()}
              className="size-7 cursor-pointer rounded-full border border-black/10 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
            />
            <input
              ref={colorInput}
              type="color"
              defaultValue={current}
              onChange={ev => {
                // Fires on every move in the picker: send once it settles.
                const v = ev.target.value;
                window.clearTimeout(pick.current);
                pick.current = window.setTimeout(() => send({ rgb: fromHex(v) }), 400);
              }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
          </div>
        </div>
      )}

      {supportsWhite(e) && (
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-caption-1-regular text-text-tertiary">
            <span>Blanc</span>
            <span className="tabular-nums">{kelvin < 3300 ? 'chaud' : kelvin > 5000 ? 'froid' : 'neutre'} · {kelvin} K</span>
          </span>
          <input
            type="range"
            min={minK}
            max={maxK}
            step={50}
            value={kelvin}
            onChange={ev => setKelvin(Number(ev.target.value))}
            {...release(() => send({ kelvin }))}
            className="ha-kelvin w-full"
            style={{ background: `linear-gradient(to right, ${warm}, ${mid}, ${cool})` }}
            aria-label="Température du blanc"
          />
        </label>
      )}
    </div>
  );
}
