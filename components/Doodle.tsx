import { cx } from '../utils/cx';

/**
 * Hand-drawn ink doodles for the "Papier" style (eyes, heart, asterisk,
 * star, spiral, hammer), in the spirit of the paper video. Strokes are a
 * little uneven on purpose. `kind` picks one; `seed` cycles through them.
 */

const DOODLES = {
  asterisk: (
    <g strokeWidth="2.6">
      <path d="M12 3.2c.3 3 .1 6.1-.2 17.4" />
      <path d="M4.2 7.4c2.6 1.4 9.4 5.8 15.4 9.4" />
      <path d="M19.6 6.8c-3.2 2.2-9.9 6.6-15.2 10.2" />
    </g>
  ),
  heart: <path strokeWidth="2.6" d="M12 20.2C7.4 16.6 3.4 13.3 3.8 8.7c.3-3.2 3.9-5 6.3-2.9.8.7 1.4 1.6 1.9 2.6.6-1.3 1.5-2.6 2.9-3.2 2.6-1.1 5.5.6 5.4 3.6-.1 4.8-4.4 8.1-8.3 11.4Z" />,
  eyes: (
    <g strokeWidth="2.2">
      <path d="M7.6 4.4c-2.9.2-4 4.1-3.8 7.8.2 3.9 1.7 7.5 4.2 7.3 2.7-.2 3.5-4.4 3.3-8-.2-3.8-1.2-7.3-3.7-7.1Z" />
      <path d="M16.4 4.2c-2.8 0-3.9 3.8-3.8 7.7.1 3.9 1.4 7.6 4 7.5 2.8-.1 3.7-4.2 3.5-8-.1-3.9-1.1-7.2-3.7-7.2Z" />
      <circle cx="8.4" cy="9" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="17.2" cy="8.8" r="1.9" fill="currentColor" stroke="none" />
    </g>
  ),
  star: <path strokeWidth="2.4" d="M12 3.4l2.3 5.6 6 .5-4.6 3.9 1.5 5.9L12 16.2l-5.2 3.1 1.5-5.9-4.6-3.9 6-.5L12 3.4Z" />,
  spiral: <path strokeWidth="2.3" d="M12.4 12.2c.4-1.2-1.2-1.9-2-1-1.2 1.3.1 3.5 1.9 3.3 2.6-.3 3.3-3.6 1.8-5.4-2-2.5-6.2-1.6-7.1 1.4-1.1 3.7 2 7.2 5.8 7 4.8-.3 7.4-5.6 5.4-9.7" />,
  hammer: (
    <g strokeWidth="2.5">
      <path d="M4.2 6.2c3.6-2.2 9.8-2.9 15.4-1.4l-.4 3.4c-4.4-.6-10.5-.2-14.6.8Z" />
      <path d="M11.4 7.6c.4 4.2.5 8.6.2 12.6" />
    </g>
  ),
} as const;

export type DoodleKind = keyof typeof DOODLES;
const ORDER: DoodleKind[] = ['asterisk', 'eyes', 'heart', 'star', 'spiral', 'hammer'];

export function Doodle({ kind, seed = 0, className }: { kind?: DoodleKind; seed?: number; className?: string }) {
  const k = kind ?? ORDER[Math.abs(seed) % ORDER.length];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cx('paper-doodle shrink-0 text-text-primary', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DOODLES[k]}
    </svg>
  );
}

/** A pen underline, drawn when the section is hovered. */
export function PenUnderline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden className={cx('paper-underline pointer-events-none', className)}>
      <path d="M2 8c30-5 62-6 96-3 32 3 66 2 100-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Torn paper scraps glued at the edges of the page (decoration). */
export function PaperScraps() {
  return (
    <>
      {/* A sepia photo corner, bottom right (below the content, never over a tile) */}
      <div
        aria-hidden
        className="paper-scrap"
        style={{
          right: -46,
          bottom: -40,
          width: 230,
          height: 170,
          rotate: '8deg',
          background:
            'linear-gradient(135deg, #8d8577 0%, #6f685c 40%, #a39a8a 70%, #5d574d 100%), repeating-linear-gradient(90deg, transparent 0 22px, rgb(0 0 0 / 0.12) 22px 25px)',
          backgroundBlendMode: 'multiply',
          clipPath: 'polygon(0 6%, 12% 0, 26% 5%, 41% 1%, 58% 6%, 73% 2%, 88% 7%, 100% 3%, 97% 30%, 100% 55%, 96% 78%, 100% 100%, 0 100%)',
        }}
      />
      {/* Tape holding it */}
      <div
        aria-hidden
        className="paper-scrap"
        style={{
          right: 96,
          bottom: 112,
          width: 70,
          height: 20,
          rotate: '-18deg',
          background: 'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.2) 0 6px, transparent 6px 12px), rgb(214 180 120 / 0.75)',
        }}
      />
    </>
  );
}

/** A handwritten note with a drawn arrow, e.g. pointing at the favourites. */
export function PenNote({ children, className }: { children: string; className?: string }) {
  return (
    <span aria-hidden className={cx('pointer-events-none flex items-end gap-1 text-text-secondary', className)}>
      <svg viewBox="0 0 80 50" className="paper-arrow h-10 w-16 -scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 6c18 2 38 10 50 24 5 6 8 11 9 16" />
        <path d="M54 40c3 2 6 4 9 6 1-4 2-7 4-10" />
      </svg>
      <span className="paper-hand -mb-1 text-[22px] leading-none">{children}</span>
    </span>
  );
}
