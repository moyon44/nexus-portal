import React, { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../lib/motion';

/**
 * Custom cursor (per device, on by default with a mouse). One set of parts,
 * dressed differently by each style (styles/skins.css, "Cursor" blocks):
 *  - an arrow that follows the pointer exactly and tilts, in the accent or
 *    the tile's brand colour, over anything clickable (a pencil on Papier,
 *    a drafting cross on Plan);
 *  - a frame that trails it and wraps the button under it (Terminal corner
 *    brackets, Plan dashed outline, Brutaliste black box; hidden elsewhere);
 *  - crosshair guides and a coordinates readout (Plan only);
 * and small buttons lean toward the pointer. Text fields keep the system
 * caret. Off on touch screens and under prefers-reduced-motion.
 *
 * Positions go through the `translate` property, so a style is free to
 * rotate or scale the parts (they turn about their own centre).
 *
 * Sizes come from CSS: --ring-idle and --ring-halo on .fx-cursor; the
 * radius of the control being wrapped is handed over as --r.
 */

const KEY = 'portail:cursor';
const EVENT = 'portail:cursor';
const INTERACTIVE = 'a, button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], label, summary, select, .tile, .row-item, .icon-item';
const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [contenteditable="true"]';

export function cursorEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setCursorEnabled(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // This page load only.
  }
  window.dispatchEvent(new Event(EVENT));
}

const usable = () => cursorEnabled() && window.matchMedia('(pointer: fine)').matches && !reducedMotion();

type Mode = 'idle' | 'wrap' | 'halo' | 'text';

export const FancyCursor: React.FC = () => {
  const [on, setOn] = useState(usable);
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const guideX = useRef<HTMLDivElement>(null);
  const guideY = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setOn(usable());
    const media = window.matchMedia('(pointer: fine)');
    window.addEventListener(EVENT, update);
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener(EVENT, update);
      media.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    html.dataset.cursor = '';
    const box = root.current!;

    const p = { x: -100, y: -100 };
    const r = { x: -100, y: -100, w: 34, h: 34 };
    let target: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;
    let mode: Mode = 'idle';
    let size = { idle: 34, halo: 64 };
    let frame = 0;
    let lastMove = 0;
    let rawTarget: Element | null = null;
    let showLabel = false;
    // Where the magnetised button sits at rest (read once, not on every move).
    let home = { x: 0, y: 0 };

    const readSizes = () => {
      const cs = getComputedStyle(box);
      size = {
        idle: parseFloat(cs.getPropertyValue('--ring-idle')) || 34,
        halo: parseFloat(cs.getPropertyValue('--ring-halo')) || 64,
      };
      showLabel = getComputedStyle(label.current!).display !== 'none';
    };

    const release = () => {
      if (magnet) magnet.style.translate = '';
      magnet = null;
    };

    const setMode = (next: Mode, el: HTMLElement | null) => {
      box.dataset.mode = next;
      if (next === 'wrap' && el) {
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8;
        box.style.setProperty('--r', `${Math.min(radius + 4, 9999)}px`);
      }
      // Some styles tint the ring with the tile's brand colour.
      const tile = el?.closest<HTMLElement>('.tile, .row-item, .icon-item, [data-tile]');
      const brand = tile?.style.getPropertyValue('--brand') || '';
      if (brand) box.style.setProperty('--brand-c', brand);
      else box.style.removeProperty('--brand-c');
      readSizes(); // the style may have changed since the last move
      mode = next;
    };

    // Hit-testing runs once per new element under the pointer, not per move.
    const retarget = (t: Element | null) => {
      rawTarget = t;
      const text = t?.closest<HTMLElement>(TEXT) ?? null;
      const hit = text ? null : t?.closest<HTMLElement>(INTERACTIVE) ?? null;
      if (text) {
        if (mode !== 'text') {
          release();
          target = text;
          setMode('text', text);
        }
      } else if (hit !== target || mode === 'text') {
        release();
        target = hit;
        if (!hit) setMode('idle', null);
        else {
          const b = hit.getBoundingClientRect();
          setMode(b.width > 160 || b.height > 72 ? 'halo' : 'wrap', hit);
          // Small buttons lean toward the pointer.
          if (mode === 'wrap' && hit.tagName === 'BUTTON' && b.width <= 72 && b.height <= 56) {
            magnet = hit;
            home = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
          }
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      p.x = e.clientX;
      p.y = e.clientY;
      lastMove = performance.now();
      if (e.target !== rawTarget) retarget(e.target as Element | null);
      // Everything else is written once per frame, however fast the mouse reports.
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      frame = 0;
      box.style.opacity = '1';
      dot.current!.style.translate = `${p.x}px ${p.y}px`;
      if (showLabel) {
        guideX.current!.style.translate = `0 ${p.y}px`;
        guideY.current!.style.translate = `${p.x}px 0`;
        label.current!.style.translate = `${p.x + 16}px ${p.y + 18}px`;
        label.current!.textContent = `X ${String(Math.round(p.x)).padStart(4, '0')}  Y ${String(Math.round(p.y)).padStart(4, '0')}`;
      }
      if (magnet) magnet.style.translate = `${((p.x - home.x) * 0.25).toFixed(1)}px ${((p.y - home.y) * 0.25).toFixed(1)}px`;

      // Ring: on a small control it takes the control's box, else a circle.
      let tx = p.x;
      let ty = p.y;
      let tw = size.idle;
      let th = size.idle;
      if (mode === 'wrap' && target?.isConnected) {
        const b = target.getBoundingClientRect();
        tx = b.left + b.width / 2;
        ty = b.top + b.height / 2;
        tw = b.width + 10;
        th = b.height + 10;
      } else if (mode === 'halo') {
        tw = th = size.halo;
      } else if (mode === 'text') {
        tw = 4;
        th = 22;
      }
      const k = mode === 'wrap' ? 0.3 : 0.22;
      r.x += (tx - r.x) * k;
      r.y += (ty - r.y) * k;
      r.w += (tw - r.w) * 0.25;
      r.h += (th - r.h) * 0.25;
      ring.current!.style.translate = `${(r.x - r.w / 2).toFixed(1)}px ${(r.y - r.h / 2).toFixed(1)}px`;
      ring.current!.style.width = `${r.w.toFixed(1)}px`;
      ring.current!.style.height = `${r.h.toFixed(1)}px`;

      const settled = Math.abs(tx - r.x) < 0.3 && Math.abs(ty - r.y) < 0.3 && Math.abs(tw - r.w) < 0.3 && Math.abs(th - r.h) < 0.3;
      // Keep going while something moves (a tile may still be sliding under the ring).
      if (!settled || now - lastMove < 400) frame = requestAnimationFrame(tick);
    };

    // "Busy" for a moment after a click (Windows 98 shows its hourglass).
    let busy = 0;
    const onDown = () => {
      box.setAttribute('data-down', '');
      box.setAttribute('data-busy', '');
      window.clearTimeout(busy);
      busy = window.setTimeout(() => box.removeAttribute('data-busy'), 900);
    };
    const onUp = () => box.removeAttribute('data-down');
    const onLeave = () => {
      box.style.opacity = '0';
      release();
      target = null;
      rawTarget = null;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    readSizes();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    html.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(busy);
      release();
      delete html.dataset.cursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('scroll', onScroll, { capture: true });
      html.removeEventListener('pointerleave', onLeave);
    };
  }, [on]);

  if (!on) return null;
  return (
    <div ref={root} aria-hidden className="fx-cursor" data-mode="idle" style={{ opacity: 0 }}>
      <div ref={guideX} className="fx-cursor-guide fx-cursor-guide-x" />
      <div ref={guideY} className="fx-cursor-guide fx-cursor-guide-y" />
      <div ref={ring} className="fx-cursor-ring">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div ref={dot} className="fx-cursor-dot">
        {/* The pointer itself; each style colours it (--cur-fill, --cur-stroke). */}
        <svg viewBox="0 0 24 24" className="fx-cursor-arrow">
          <path d="M4 2.2v16.6l4.4-4.1 2.9 6.6 2.7-1.2-2.8-6.4h6.3z" />
        </svg>
      </div>
      <div ref={label} className="fx-cursor-label" />
    </div>
  );
};
