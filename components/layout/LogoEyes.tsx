import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../../lib/motion';
import { cx } from '../../utils/cx';

/**
 * The portal's mark with a face (bencho.dev "Eye tracker"): two eyes follow
 * the pointer anywhere on the page and blink now and then. At night they
 * close; when a service is down the brows frown and the mark turns red.
 */
export function LogoEyes({ worried, asleep }: { worried: boolean; asleep: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 140);
        setLook({ x: (dx / d) * 1.6 * reach, y: (dy / d) * 1.4 * reach });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Blink every 3–7 s (twice in a row sometimes).
  useEffect(() => {
    if (reducedMotion() || asleep) return;
    let t: number;
    const schedule = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        if (Math.random() < 0.25) window.setTimeout(() => (setBlink(true), window.setTimeout(() => setBlink(false), 120)), 260);
        schedule();
      }, 3000 + Math.random() * 4000);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [asleep]);

  const closed = asleep || blink;

  return (
    <span
      ref={ref}
      aria-hidden
      className={cx(
        'relative grid size-7 shrink-0 place-items-center rounded-[9px] bg-linear-to-b shadow-nav-selected transition-colors duration-500',
        worried ? 'from-rose-400 to-rose-600' : 'from-accent-400 to-accent-600',
      )}
    >
      <svg viewBox="0 0 28 28" className="size-7">
        {/* Brows: only when worried */}
        <g
          className="transition-opacity duration-300"
          style={{ opacity: worried && !asleep ? 1 : 0 }}
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <line x1="7" y1="8.5" x2="11.5" y2="10" />
          <line x1="21" y1="8.5" x2="16.5" y2="10" />
        </g>
        {[9.5, 18.5].map(cx0 => (
          <g key={cx0}>
            {closed ? (
              <path
                d={asleep ? `M${cx0 - 3} 14.5 q3 2.2 6 0` : `M${cx0 - 3} 14.5 h6`}
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            ) : (
              <>
                <ellipse cx={cx0} cy="14.5" rx="3.3" ry={worried ? 3.3 : 3.8} fill="white" />
                <circle
                  cx={cx0 + look.x}
                  cy={14.5 + look.y}
                  r="1.7"
                  fill="#111"
                  style={{ transition: 'cx 0.12s ease-out, cy 0.12s ease-out' }}
                />
              </>
            )}
          </g>
        ))}
        {asleep && (
          <text x="21" y="7" fontSize="6" fill="white" fontWeight="700" opacity="0.9" className="animate-pulse">
            z
          </text>
        )}
      </svg>
    </span>
  );
}
