import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../store';
import { isTyping } from '../lib/actions';
import { dashboardIconUrl } from '../lib/icons';
import { Kbd } from './ui/badge';
import type { Service } from '../types';

/**
 * Words typed anywhere (outside a text field), like « boum » for the gravity
 * (components/Gravity.tsx):
 *   disco    the tiles flash in rhythm under a mirror ball
 *   matrix   green rain made of the services' names
 *   snake    a playable Snake that eats the tiles
 *   404      the portal pretends to be gone for three seconds
 *
 * Some first letters are shortcuts too (« 4 » opens favourite 4, the « n »
 * of « snake » adds a link). A key that starts or continues a word is held
 * back for a moment; if the word stops there, the held keys are replayed so
 * the shortcuts still work (a favourite still opens: the browser keeps the
 * key press's permission to open a tab for a few seconds).
 */

const CODES = ['disco', 'matrix', 'snake', '404'] as const;
type Egg = (typeof CODES)[number];
const HOLD = 600;
const REPLAY = '__eggReplay';

const EVENT = 'portail:egg';
/** Lets the palette start one. */
export function startEgg(egg: Egg) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: egg }));
}

export const EasterEggs: React.FC = () => {
  const [egg, setEgg] = useState<Egg | null>(null);
  const stop = useCallback(() => setEgg(null), []);

  useEffect(() => {
    let typed = '';
    let held: KeyboardEvent[] = [];
    let timer = 0;

    const replay = () => {
      window.clearTimeout(timer);
      const keys = held;
      held = [];
      typed = '';
      for (const k of keys) {
        const copy = new KeyboardEvent('keydown', { key: k.key, code: k.code, bubbles: true, cancelable: true, shiftKey: k.shiftKey });
        (copy as any)[REPLAY] = true;
        (k.target instanceof EventTarget ? k.target : window).dispatchEvent(copy);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e as any)[REPLAY] || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || e.key.length !== 1) return;
      if (document.querySelector('[data-egg-running]')) return;
      const next = typed + e.key.toLowerCase();
      if (!CODES.some(c => c.startsWith(next))) {
        // The word stopped: give the held keys back, then this one goes on as usual.
        if (held.length) replay();
        typed = '';
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      window.clearTimeout(timer);
      const done = CODES.find(c => c === next);
      if (done) {
        held = [];
        typed = '';
        setEgg(done);
        return;
      }
      typed = next;
      held.push(e);
      timer = window.setTimeout(replay, HOLD);
    };
    const onStart = (e: Event) => setEgg((e as CustomEvent<Egg>).detail);

    window.addEventListener('keydown', onKey, true);
    window.addEventListener(EVENT, onStart);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(EVENT, onStart);
    };
  }, []);

  // Escape ends any of them.
  useEffect(() => {
    if (!egg) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        stop();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [egg, stop]);

  if (!egg) return null;
  return createPortal(
    <div data-egg-running={egg}>
      {egg === 'disco' && <Disco onDone={stop} />}
      {egg === 'matrix' && <Matrix onDone={stop} />}
      {egg === 'snake' && <Snake onDone={stop} />}
      {egg === '404' && <NotFound onDone={stop} />}
    </div>,
    document.body,
  );
};

/* ---- disco ------------------------------------------------------------------ */

function Disco({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    document.documentElement.dataset.disco = '';
    const t = window.setTimeout(onDone, 12_000);
    return () => {
      window.clearTimeout(t);
      delete document.documentElement.dataset.disco;
    };
  }, [onDone]);
  return (
    <div className="egg-disco pointer-events-none fixed inset-0 z-[90]" aria-hidden>
      <div className="egg-disco-lights" />
      <div className="egg-disco-string" />
      <div className="egg-disco-ball" />
    </div>
  );
}

/* ---- matrix ----------------------------------------------------------------- */

function Matrix({ onDone }: { onDone: () => void }) {
  const { data } = useDashboard();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const size = 16;
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const cols = Math.ceil(window.innerWidth / size);
    // Each column spells a service name, top to bottom, among katakana.
    const names = data.services.map(s => s.name.toUpperCase().replace(/\s+/g, '')).filter(Boolean);
    const kana = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';
    const drops = Array.from({ length: cols }, () => ({
      y: -Math.random() * 60,
      word: names[Math.floor(Math.random() * names.length)] ?? 'NEXUS',
      i: 0,
      speed: 0.5 + Math.random() * 0.7,
    }));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 45) return;
      last = t;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.font = `600 ${size}px ui-monospace, monospace`;
      drops.forEach((d, x) => {
        const fromWord = Math.random() < 0.7;
        const ch = fromWord ? d.word[d.i % d.word.length] : kana[Math.floor(Math.random() * kana.length)];
        if (fromWord) d.i++;
        const y = d.y * size;
        ctx.fillStyle = '#d6ffe1';
        ctx.fillText(ch, x * size, y);
        ctx.fillStyle = '#22ff66';
        ctx.fillText(ch, x * size, y - size);
        d.y += d.speed;
        if (y > window.innerHeight && Math.random() > 0.97) {
          d.y = 0;
          d.i = 0;
          d.word = names[Math.floor(Math.random() * names.length)] ?? 'NEXUS';
        }
      });
    };
    raf = requestAnimationFrame(frame);
    const fade = window.setTimeout(() => setFading(true), 8_500);
    const end = window.setTimeout(onDone, 9_300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fade);
      window.clearTimeout(end);
    };
  }, [data.services, onDone]);

  return (
    <div
      className="fixed inset-0 z-[90] cursor-pointer transition-opacity duration-700"
      style={{ opacity: fading ? 0 : 1 }}
      onClick={onDone}
      aria-hidden
    >
      <canvas ref={canvas} className="size-full" />
      <p className="egg-matrix-text pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-2xl font-bold">
        Réveille-toi, Neo… tes conteneurs t'appellent.
      </p>
    </div>
  );
}

/* ---- snake ------------------------------------------------------------------ */

type Cell = { x: number; y: number };
type Food = Cell & { service: Service; img: HTMLImageElement | null };

const CELL = 28;
const TICK = 120;

function Snake({ onDone }: { onDone: () => void }) {
  const { data } = useDashboard();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [eaten, setEaten] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const cols = Math.max(12, Math.floor(Math.min(window.innerWidth - 48, 900) / CELL));
    const rows = Math.max(10, Math.floor(Math.min(window.innerHeight - 220, 600) / CELL));
    c.width = cols * CELL * dpr;
    c.height = rows * CELL * dpr;
    c.style.width = `${cols * CELL}px`;
    c.style.height = `${rows * CELL}px`;
    ctx.scale(dpr, dpr);

    const pool = data.services.filter(s => s.isVisible !== false);
    const images = new Map<string, HTMLImageElement | null>();
    const imageOf = (s: Service) => {
      if (images.has(s.id)) return images.get(s.id)!;
      const src = dashboardIconUrl({ name: s.name, icon: s.icon }) ?? s.customImage ?? null;
      let img: HTMLImageElement | null = null;
      if (src) {
        img = new Image();
        img.src = src;
      }
      images.set(s.id, img);
      return img;
    };

    let snake: Cell[] = [
      { x: 5, y: Math.floor(rows / 2) },
      { x: 4, y: Math.floor(rows / 2) },
      { x: 3, y: Math.floor(rows / 2) },
    ];
    let dir: Cell = { x: 1, y: 0 };
    let queued: Cell[] = [];
    let alive = true;
    let points = 0;

    const place = (): Food => {
      const s = pool[Math.floor(Math.random() * pool.length)];
      let cell: Cell;
      do cell = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      while (snake.some(p => p.x === cell.x && p.y === cell.y));
      return { ...cell, service: s, img: s ? imageOf(s) : null };
    };
    let food = place();

    const draw = () => {
      const styles = getComputedStyle(document.documentElement);
      const ground = styles.getPropertyValue('--color-background-secondary-default').trim() || '#1f1f1f';
      const accent = styles.getPropertyValue('--color-accent-400').trim() || '#8ab4ff';
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, cols * CELL, rows * CELL);
      ctx.fillStyle = 'rgba(127,127,127,0.12)';
      for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) if ((x + y) % 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      // Food: the tile's logo (or its initial).
      const fx = food.x * CELL;
      const fy = food.y * CELL;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(fx + 2, fy + 2, CELL - 4, CELL - 4, 7);
      ctx.fill();
      if (food.img?.complete && food.img.naturalWidth) ctx.drawImage(food.img, fx + 5, fy + 5, CELL - 10, CELL - 10);
      else {
        ctx.fillStyle = '#111';
        ctx.font = '700 14px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((food.service?.name ?? '?')[0]?.toUpperCase() ?? '?', fx + CELL / 2, fy + CELL / 2 + 1);
      }
      // Snake.
      snake.forEach((p, i) => {
        ctx.fillStyle = accent;
        ctx.globalAlpha = i === 0 ? 1 : Math.max(0.35, 1 - i / (snake.length + 4));
        ctx.beginPath();
        ctx.roundRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4, i === 0 ? 9 : 6);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // Eyes.
      const h = snake[0];
      ctx.fillStyle = '#fff';
      const ex = dir.y !== 0 ? [0.3, 0.7] : [dir.x > 0 ? 0.65 : 0.35, dir.x > 0 ? 0.65 : 0.35];
      const ey = dir.x !== 0 ? [0.3, 0.7] : [dir.y > 0 ? 0.65 : 0.35, dir.y > 0 ? 0.65 : 0.35];
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.arc(h.x * CELL + ex[k] * CELL, h.y * CELL + ey[k] * CELL, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      if (!alive) return;
      const turn = queued.shift();
      if (turn) dir = turn;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some(p => p.x === head.x && p.y === head.y)) {
        alive = false;
        setOver(true);
        return;
      }
      snake = [head, ...snake];
      if (head.x === food.x && head.y === food.y) {
        points++;
        setScore(points);
        setEaten(food.service?.name ?? null);
        food = place();
      } else snake.pop();
      draw();
    };

    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Cell> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        z: { x: 0, y: -1 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        q: { x: -1, y: 0 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      if (e.key === 'Escape') return;
      // While playing, no key reaches the portal's shortcuts.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!alive && (e.key === ' ' || e.key === 'Enter')) {
        setOver(false);
        setScore(0);
        setEaten(null);
        setRound(r => r + 1);
        return;
      }
      const d = map[e.key] ?? map[e.key.toLowerCase()];
      if (!d) return;
      const last = queued[queued.length - 1] ?? dir;
      if (d.x === -last.x && d.y === -last.y) return;
      if (d.x === last.x && d.y === last.y) return;
      queued = [...queued, d].slice(-2);
    };

    draw();
    const loop = window.setInterval(step, TICK);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearInterval(loop);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [data.services, round]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-[900px] items-center justify-between gap-4 text-body-regular text-white">
        <span className="font-mono text-headline-medium">🐍 {score} tuile{score > 1 ? 's' : ''} mangée{score > 1 ? 's' : ''}</span>
        <span className="truncate text-white/70">{eaten ? `Miam, ${eaten} !` : 'Flèches ou ZQSD'}</span>
        <button type="button" onClick={onDone} className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-body-2-medium hover:bg-white/20">
          Quitter <Kbd>Échap</Kbd>
        </button>
      </div>
      <div className="relative">
        <canvas ref={canvas} className="rounded-2xl shadow-2xl" />
        {over && (
          <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55 text-center text-white">
            <div className="flex flex-col items-center gap-2">
              <p className="font-mono text-display-4-regular">Game over</p>
              <p className="text-body-regular text-white/80">
                {score} tuile{score > 1 ? 's' : ''} au compteur · <Kbd>Espace</Kbd> pour rejouer
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- 404 -------------------------------------------------------------------- */

function NotFound({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'gone' | 'joke' | 'out'>('gone');
  useEffect(() => {
    const a = window.setTimeout(() => setPhase('joke'), 3000);
    const b = window.setTimeout(() => setPhase('out'), 4400);
    const c = window.setTimeout(onDone, 5000);
    return () => [a, b, c].forEach(window.clearTimeout);
  }, [onDone]);
  return (
    <div
      onClick={onDone}
      className="egg-404 fixed inset-0 z-[90] cursor-default bg-white text-black transition-opacity duration-500"
      style={{ opacity: phase === 'out' ? 0 : 1, fontFamily: 'Times New Roman, serif' }}
    >
      <div className="pt-6 text-center">
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0.67em 0' }}>404 Not Found</h1>
        <hr style={{ borderColor: '#ccc', margin: '0 8px' }} />
        <p style={{ margin: '8px 0', fontSize: 16 }}>nginx</p>
      </div>
      {phase !== 'gone' && (
        <p className="egg-404-joke absolute inset-x-0 top-1/2 text-center font-sans text-display-4-regular">Je plaisante 😄</p>
      )}
    </div>
  );
}
