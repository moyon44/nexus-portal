import { useRef, useState } from 'react';
import { cx } from '../../utils/cx';

/**
 * Single-series area chart (0–100 % by default) for the System page: one
 * accent hue, a 2px line over a soft fill, a recessive mid guide, and a
 * crosshair with a tooltip on hover. The title names the series, so there is
 * no legend. `domain` and `format` fit other scales (Home Assistant sensors).
 */
export function AreaChart({
  points,
  label,
  height = 72,
  className,
  domain = [0, 100],
  format = (v: number) => `${Math.round(v)} %`,
  period = 'sur une heure',
}: {
  points: { t: number; v: number }[];
  /** Series name for the tooltip and the accessible summary. */
  label: string;
  height?: number;
  className?: string;
  /** Values mapped to the bottom and top edges. */
  domain?: [number, number];
  format?: (v: number) => string;
  /** For the accessible summary ("sur 24 h"). */
  period?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 300;

  if (points.length < 2) {
    return <div className={cx('grid place-items-center text-body-2-regular text-text-tertiary', className)} style={{ height }}>Mesures en cours…</div>;
  }

  const x = (i: number) => (i / (points.length - 1)) * width;
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const y = (v: number) => height - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * (height - 4);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const values = points.map(p => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const h = hover !== null ? points[hover] : null;

  return (
    <div className={cx('relative', className)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-full w-full overflow-visible text-accent-400"
        style={{ height }}
        role="img"
        aria-label={`${label} ${period} : de ${format(min)} à ${format(max)}`}
        onPointerMove={e => {
          const r = ref.current!.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line x1="0" x2={width} y1={y(lo + span / 2)} y2={y(lo + span / 2)} stroke="var(--color-separator-border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        <path d={`M0,${height} L${line} L${width},${height} Z`} fill="currentColor" opacity="0.14" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="var(--color-text-tertiary)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 rounded-lg border border-border-button-default bg-background-secondary-default px-2 py-1 text-caption-1-medium whitespace-nowrap text-text-primary shadow-dropdown tabular-nums"
          style={{ left: `${(hover / (points.length - 1)) * 100}%` }}
        >
          {label} {format(h.v)} · <span className="text-text-tertiary">{new Date(h.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}
    </div>
  );
}
