import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RiCheckLine, RiPlayFill } from '@remixicon/react';
import type { Service } from '../types';
import { LinkIcon } from './LinkIcon';
import { cx } from '../utils/cx';

/**
 * Dynamic Island (bencho.dev): a black pill at the top centre that swells
 * into a message when something happens (an action's result, a service
 * going down or coming back, a new playback) and shrinks away after a few
 * seconds. Messages queue up and play one after the other; clicking one
 * runs its action (e.g. opens the service's details).
 */

export type IslandTone = 'ok' | 'err' | 'info';

export interface IslandEvent {
  id: number;
  message: string;
  tone: IslandTone;
  service?: Service;
  onClick?: () => void;
  /** Label of what a click does ("Annuler"): shown as a pill, and the message stays longer. */
  action?: string;
}

const DURATION: Record<IslandTone, number> = { ok: 3200, info: 4500, err: 6000 };
/** Time left to click an action such as "Annuler". */
const ACTION_DURATION = 7000;
const IDLE = 40; // px: the pill it grows from and shrinks back to

export function Island({ queue, onDone }: { queue: IslandEvent[]; onDone: (id: number) => void }) {
  const current = queue[0] ?? null;
  const [phase, setPhase] = useState<'hidden' | 'open' | 'closing'>('hidden');
  const [shown, setShown] = useState<IslandEvent | null>(null);
  const [width, setWidth] = useState(IDLE);
  const inner = useRef<HTMLSpanElement>(null);

  // Next event: grow into it, hold, shrink, then let the queue move on.
  useEffect(() => {
    if (!current) return;
    setShown(current);
    setPhase('open');
    const duration = current.action ? ACTION_DURATION : DURATION[current.tone];
    const hold = window.setTimeout(() => setPhase('closing'), duration);
    const done = window.setTimeout(() => onDone(current.id), duration + 420);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(done);
    };
  }, [current?.id]);

  useEffect(() => {
    if (!current && phase === 'closing') {
      const t = window.setTimeout(() => setPhase('hidden'), 300);
      return () => window.clearTimeout(t);
    }
  }, [current, phase]);

  useLayoutEffect(() => {
    if (phase === 'open' && inner.current) setWidth(Math.min(inner.current.scrollWidth + 28, window.innerWidth - 32));
    else setWidth(IDLE);
  }, [phase, shown?.id]);

  if (phase === 'hidden' || !shown) return null;
  const open = phase === 'open';

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[95] flex justify-center" aria-live="polite" role="status">
      <button
        type="button"
        onClick={() => {
          shown.onClick?.();
          setPhase('closing');
        }}
        tabIndex={shown.onClick ? 0 : -1}
        className={cx(
          'island pointer-events-auto relative flex h-10 items-center overflow-hidden rounded-full bg-[#0a0a0b] text-white outline-none',
          'shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.08)]',
          shown.onClick ? 'cursor-pointer' : 'cursor-default',
          open ? 'island-open' : 'island-closing',
        )}
        style={{ width }}
      >
        <span
          ref={inner}
          className={cx(
            'flex shrink-0 items-center gap-2.5 pr-1 pl-3.5 whitespace-nowrap transition-[opacity,filter] duration-300',
            open ? 'opacity-100 blur-0 delay-150' : 'opacity-0 blur-[4px]',
          )}
        >
          <span className="relative grid size-5 shrink-0 place-items-center">
            {shown.service ? (
              <LinkIcon service={shown.service} size={18} />
            ) : shown.tone === 'ok' ? (
              <span className="grid size-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                <RiCheckLine className="size-3.5" aria-hidden />
              </span>
            ) : shown.tone === 'info' ? (
              <RiPlayFill className="size-4 text-sky-300" aria-hidden />
            ) : null}
            {shown.tone === 'err' && (
              <span className="absolute -right-1 -bottom-1 size-2 rounded-full bg-rose-500 ring-2 ring-[#0a0a0b]">
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-500" />
              </span>
            )}
          </span>
          <span className={cx('text-body-2-medium', shown.tone === 'err' && 'text-rose-200')}>{shown.message}</span>
          {shown.action && (
            <span className="ml-1 rounded-full bg-white/15 px-2.5 py-0.5 text-caption-1-medium text-white">{shown.action}</span>
          )}
          {shown.tone === 'info' && (
            <span aria-hidden className="island-eq ml-1 flex h-3 items-end gap-[2px]">
              <span />
              <span />
              <span />
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
