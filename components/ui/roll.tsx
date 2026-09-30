import { cx } from '../../utils/cx';

/**
 * Rolling digits, like a mechanical counter: each digit is a column 0–9
 * that slides to its value when it changes. Other characters (",", ":",
 * "%") stay put. Needs `tabular-nums` on the text so widths don't jump.
 * Screen readers get the plain value.
 */
export function Roll({ value, className }: { value: string | number; className?: string }) {
  const text = String(value);
  return (
    <span className={cx('roll inline-flex tabular-nums', className)} aria-label={text} role="text">
      {[...text].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={`${text.length}-${i}`} aria-hidden className="roll-digit">
            <span className="invisible">0</span>
            <span className="roll-column" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map(d => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`${text.length}-${i}`} aria-hidden className="whitespace-pre">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
