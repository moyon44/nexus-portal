import { forwardRef, useImperativeHandle, useRef } from 'react';
import { reducedMotion } from '../lib/motion';

/**
 * Letters that wobble when the pointer rubs over them and, past a number of
 * hits, fall apart and gather back (the "Work" pill of the paper video).
 * The parent calls `hit()` from its pointermove; screen readers get the
 * plain text.
 */

export interface WobbleHandle {
  hit: () => void;
}

const HITS_TO_SHATTER = 14;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const WobbleText = forwardRef<WobbleHandle, { text: string; className?: string }>(function WobbleText(
  { text, className },
  ref,
) {
  const box = useRef<HTMLSpanElement>(null);
  const hits = useRef(0);
  const last = useRef(0);
  const shattered = useRef(false);

  useImperativeHandle(ref, () => ({
    hit() {
      if (reducedMotion() || shattered.current) return;
      const now = performance.now();
      if (now - last.current < 70) return;
      last.current = now;
      const letters = [...(box.current?.querySelectorAll<HTMLElement>('.wobble-letter') ?? [])];
      hits.current += 1;
      const intensity = Math.min(1, hits.current / HITS_TO_SHATTER);

      if (hits.current >= HITS_TO_SHATTER) {
        // Fall apart…
        shattered.current = true;
        hits.current = 0;
        letters.forEach((el, i) => {
          const fall = el.animate(
            [
              { transform: 'translate(0, 0) rotate(0deg)' },
              { transform: `translate(${rand(-10, 10)}px, ${rand(14, 30)}px) rotate(${rand(-70, 70)}deg)`, offset: 0.7 },
              { transform: `translate(${rand(-12, 12)}px, ${rand(20, 34)}px) rotate(${rand(-90, 90)}deg)` },
            ],
            { duration: 520 + i * 18, easing: 'cubic-bezier(0.55, 0, 0.9, 0.5)', fill: 'forwards' },
          );
          // …then gather back with a spring.
          fall.finished
            .then(() => {
              const back = el.animate([{ transform: getComputedStyle(el).transform }, { transform: 'translate(0, 0) rotate(0deg)' }], {
                duration: 620,
                delay: 900 + i * 25,
                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                fill: 'forwards',
              });
              return back.finished.then(() => {
                fall.cancel();
                back.cancel();
              });
            })
            .finally(() => {
              if (i === letters.length - 1) window.setTimeout(() => (shattered.current = false), 1700);
            });
        });
        return;
      }

      letters.forEach(el => {
        el.animate(
          [
            { transform: 'translate(0, 0) rotate(0deg)' },
            {
              transform: `translate(${rand(-2, 2) * (1 + intensity)}px, ${-rand(1, 3) * (1 + intensity * 1.5)}px) rotate(${rand(-8, 8) * (1 + intensity)}deg)`,
            },
            { transform: 'translate(0, 0) rotate(0deg)' },
          ],
          { duration: rand(180, 400), easing: 'ease-out' },
        );
      });
    },
  }));

  return (
    <span ref={box} className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden className="wobble-letter">
          {ch}
        </span>
      ))}
    </span>
  );
});
