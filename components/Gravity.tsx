import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RiArrowGoBackLine } from '@remixicon/react';
import type { Engine, Runner, Body, MouseConstraint } from 'matter-js';
import { isTyping } from '../lib/actions';
import { Kbd } from './ui/badge';

/**
 * Gravity (easter egg): type « boum » anywhere, or pick "Gravité" in the
 * palette. Every tile and section title on screen becomes a physical body
 * (matter-js) and falls to the bottom of the window; they can be grabbed
 * and thrown. Escape (or the button) glides everything back into place.
 *
 * The page itself doesn't move: each element only gets a transform that
 * follows its body. A transparent layer over the page takes the pointer
 * while it runs, so a tile can't be opened by accident mid-throw.
 */

const EVENT = 'portail:gravity';
const CODE = 'boum';

/** Lets the palette start it. */
export function startGravity() {
  window.dispatchEvent(new Event(EVENT));
}

interface Item {
  el: HTMLElement;
  body: Body;
  /** Centre of the element before it fell. */
  x: number;
  y: number;
}

export const Gravity: React.FC = () => {
  const [on, setOn] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const sim = useRef<{ engine: Engine; runner: Runner; items: Item[]; mouse: MouseConstraint; M: typeof import('matter-js') } | null>(null);
  const location = useLocation();

  const stop = useCallback(() => {
    const s = sim.current;
    if (!s) return;
    sim.current = null;
    s.M.Runner.stop(s.runner);
    s.M.Engine.clear(s.engine);
    // Glide home, then hand the elements back to the page.
    for (const { el } of s.items) {
      el.style.transition = 'transform 0.7s cubic-bezier(0.34, 1.3, 0.64, 1)';
      el.style.transform = '';
    }
    window.setTimeout(() => {
      for (const { el } of s.items) {
        el.style.transition = '';
        el.style.willChange = '';
        el.style.zIndex = '';
      }
    }, 750);
    delete document.documentElement.dataset.gravity;
    setOn(false);
  }, []);

  const start = useCallback(async () => {
    if (sim.current) return;
    const M = (await import('matter-js')).default;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!document.querySelector('main')) return;
    const els = [...document.querySelectorAll<HTMLElement>('main [data-flip], main .section-title')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    });
    if (!els.length) return;

    // The walls are the edges of the scrolling area: it clips what leaves it.
    const box = document.querySelector('main')!.getBoundingClientRect();
    const engine = M.Engine.create({ gravity: { x: 0, y: 1.1 } });
    const wall = { isStatic: true };
    const t = 400;
    const midX = (box.left + box.right) / 2;
    const midY = (box.top + box.bottom) / 2;
    M.Composite.add(engine.world, [
      M.Bodies.rectangle(midX, box.bottom + t / 2, box.width + t * 2, t, wall), // floor
      M.Bodies.rectangle(midX, box.top - t / 2, box.width + t * 2, t, wall), // ceiling
      M.Bodies.rectangle(box.left - t / 2, midY, t, box.height + t * 2, wall), // left
      M.Bodies.rectangle(box.right + t / 2, midY, t, box.height + t * 2, wall), // right
    ]);

    const items: Item[] = els.map((el, i) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const body = M.Bodies.rectangle(x, y, r.width, r.height, {
        chamfer: { radius: Math.min(12, r.height / 3) },
        restitution: 0.35,
        friction: 0.25,
        frictionAir: 0.012,
        density: 0.0016,
      });
      // A nudge so they tumble instead of dropping flat; lower rows go first.
      M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
      M.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: -Math.random() * 2 - (i % 3) * 0.3 });
      el.style.willChange = 'transform';
      el.style.transition = 'none';
      el.style.zIndex = '60';
      return { el, body, x, y };
    });
    M.Composite.add(engine.world, items.map(i => i.body));

    const mouse = M.Mouse.create(layer.current!);
    const mc = M.MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, damping: 0.08, render: { visible: false } } });
    M.Composite.add(engine.world, mc);

    M.Events.on(engine, 'afterUpdate', () => {
      for (const { el, body, x, y } of items) {
        el.style.transform = `translate(${(body.position.x - x).toFixed(1)}px, ${(body.position.y - y).toFixed(1)}px) rotate(${body.angle.toFixed(3)}rad)`;
      }
    });
    // Grabbed tile: grabbing cursor.
    M.Events.on(mc, 'startdrag', () => layer.current?.classList.add('cursor-grabbing'));
    M.Events.on(mc, 'enddrag', () => layer.current?.classList.remove('cursor-grabbing'));

    const runner = M.Runner.create();
    M.Runner.run(runner, engine);
    sim.current = { engine, runner, items, mouse: mc, M };
    document.documentElement.dataset.gravity = '';
    setOn(true);
  }, []);

  // Palette action, and the typed code.
  useEffect(() => {
    let typed = '';
    const onStart = () => void start();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sim.current) {
        e.preventDefault();
        e.stopPropagation();
        stop();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-CODE.length);
      if (typed === CODE) {
        typed = '';
        if (sim.current) stop();
        else void start();
      }
    };
    window.addEventListener(EVENT, onStart);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener(EVENT, onStart);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [start, stop]);

  // Leaving the page or resizing the window: put everything back.
  useEffect(() => stop, [location.pathname, stop]);
  useEffect(() => {
    if (!on) return;
    window.addEventListener('resize', stop);
    return () => window.removeEventListener('resize', stop);
  }, [on, stop]);

  return (
    <>
      <div
        ref={layer}
        aria-hidden
        className={on ? 'fixed inset-0 z-[70] cursor-grab touch-none' : 'pointer-events-none fixed inset-0 -z-10'}
      />
      {on && (
        <div className="animate-dialog-in fixed top-5 left-1/2 z-[75] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border-button-default bg-background-secondary-default py-1.5 pr-1.5 pl-4 text-body-2-regular text-text-secondary shadow-dropdown">
          <span>Attrape et lance les tuiles</span>
          <button
            type="button"
            onClick={stop}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-background-tertiary-default px-3 py-1 text-body-2-medium text-text-primary hover:bg-background-tertiary-hover"
          >
            <RiArrowGoBackLine className="size-4" aria-hidden />
            Ranger <Kbd>Échap</Kbd>
          </button>
        </div>
      )}
    </>
  );
};
