import { cx } from '../../utils/cx';

/**
 * Tiny line + soft area for a recent series (0–100 by default). No axes: the
 * current value sits next to it as text, the line only shows the trend.
 */
export function Sparkline({
  values,
  max = 100,
  className,
  label,
}: {
  values: number[];
  max?: number;
  className?: string;
  /** Accessible summary, e.g. "CPU sur une heure : 3 à 12 %". */
  label?: string;
}) {
  const width = 56;
  const height = 18;
  if (values.length < 2) {
    return <span aria-hidden className={cx('inline-block h-[18px] w-14', className)} />;
  }
  const top = Math.max(max, ...values);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 1 - (Math.max(0, v) / top) * (height - 2);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('shrink-0 overflow-visible text-accent-400', className)}
    >
      <path d={`M0,${height} L${points} L${width},${height} Z`} fill="currentColor" opacity="0.14" />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Downsamples a series to at most `n` points by averaging buckets. */
export function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const size = values.length / n;
  return Array.from({ length: n }, (_, i) => {
    const bucket = values.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    return bucket.reduce((a, b) => a + b, 0) / bucket.length;
  });
}
