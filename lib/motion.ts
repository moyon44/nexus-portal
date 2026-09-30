import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

/**
 * Motion helpers. Every one of them does nothing (runs the update at once)
 * when the system asks for reduced motion or the browser lacks the API.
 */

type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Shared-element transition: `from` morphs into whatever carries the same
 * `view-transition-name` after `update` (e.g. a tile into the details panel).
 * The name is lent to `from` only for the snapshot.
 */
export function morph(name: string, from: HTMLElement | null, update: () => void) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || reducedMotion() || !from) {
    update();
    return;
  }
  from.style.viewTransitionName = name;
  const t = doc.startViewTransition(() => {
    from.style.viewTransitionName = '';
    flushSync(update);
  });
  t.finished.finally(() => (from.style.viewTransitionName = ''));
}

/** Reverse of `morph`: the element that has the name shrinks back into `to`. */
export function morphBack(name: string, to: HTMLElement | null, update: () => void) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || reducedMotion() || !to) {
    update();
    return;
  }
  const t = doc.startViewTransition(() => {
    flushSync(update);
    to.style.viewTransitionName = name;
  });
  t.finished.finally(() => (to.style.viewTransitionName = ''));
}

/** Theme switch as a circle growing from the click (Vercel / Telegram style). */
export function themeReveal(x: number, y: number, apply: () => void) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || reducedMotion()) {
    apply();
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-reveal');
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(() => flushSync(apply));
  t.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => undefined);
  t.finished.finally(() => root.classList.remove('theme-reveal'));
}

/** A copy of `from` flies along an arc onto `to`, which then gives a small pulse. */
export function flyTo(from: HTMLElement, to: HTMLElement) {
  if (reducedMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (b.bottom < 0 || b.top > window.innerHeight) return; // target off screen
  const ghost = from.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: '0',
    zIndex: '100',
    pointerEvents: 'none',
    transform: 'none',
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const s = b.width / a.width;
  const lift = Math.min(120, Math.abs(dx) * 0.25 + 40);
  ghost
    .animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + s) / 2 + 0.15})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    )
    .finished.finally(() => {
      ghost.remove();
      to.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
    });
}

/* FLIP only runs right after a move we asked for; any other layout shift
 * (a row appearing above, data refresh) just jumps, headers and tiles alike. */
let flipArmedUntil = 0;
/** Call before a reorder or a density switch: the next renders animate. */
export function armFlip(ms = 600) {
  flipArmedUntil = Date.now() + ms;
}

/**
 * FLIP: elements marked `data-flip="<id>"` inside the container glide from
 * their previous place to the new one after any render that moved them
 * (drag reorder, density switch, a tile moving to another category).
 */
export function useFlip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const last = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const scroller = root.closest('main');
    const offset = scroller?.scrollTop ?? 0;
    const next = new Map<string, DOMRect>();
    const skip = reducedMotion() || Date.now() > flipArmedUntil;
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach(el => {
      const id = el.dataset.flip!;
      const r = el.getBoundingClientRect();
      const rect = new DOMRect(r.left, r.top + offset, r.width, r.height);
      next.set(id, rect);
      const prev = last.current.get(id);
      if (!prev || skip) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 380,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    });
    last.current = next;
  });

  return ref;
}

/**
 * A burst of particles and a ring from the centre of `el` (a "like"). Used
 * when a link becomes a favourite. Everything is removed once it has faded.
 */
export function burst(el: HTMLElement, colors = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#a78bfa']) {
  if (reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: '120', pointerEvents: 'none' });
  document.body.appendChild(layer);

  const ring = document.createElement('span');
  Object.assign(ring.style, {
    position: 'absolute', left: `${cx - 14}px`, top: `${cy - 14}px`, width: '28px', height: '28px',
    borderRadius: '9999px', border: `2px solid ${colors[0]}`,
  });
  layer.appendChild(ring);
  ring.animate([{ transform: 'scale(0.3)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 480, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });

  const count = 14;
  const anims: Promise<unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    const size = 3 + Math.random() * 4;
    Object.assign(p.style, {
      position: 'absolute', left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`,
      borderRadius: i % 3 === 0 ? '2px' : '9999px', background: colors[i % colors.length],
    });
    layer.appendChild(p);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 22 + Math.random() * 26;
    anims.push(
      p.animate(
        [
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 8}px) scale(0.3) rotate(${Math.random() * 180}deg)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)' },
      ).finished,
    );
  }
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  Promise.allSettled(anims).then(() => layer.remove());
}
