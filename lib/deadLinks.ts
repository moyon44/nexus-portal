import { useEffect, useState } from 'react';
import { linksApi } from '../api';

/**
 * Dead external links from the last check (backend services/linkcheck.ts),
 * shared by every tile: fetched once, again every hour and right after a
 * check from Admin (event `portail:link-checks`).
 */

type Dead = Record<string, { reason: string; checkedAt: string }>;

let dead: Dead = {};
let started = false;
const listeners = new Set<() => void>();

const load = () =>
  linksApi
    .dead()
    .then(d => {
      dead = d;
      listeners.forEach(l => l());
    })
    .catch(() => undefined);

function start() {
  if (started) return;
  started = true;
  void load();
  window.setInterval(load, 3600_000);
  window.addEventListener('portail:link-checks', () => void load());
}

/** Why this link is dead, or null. */
export function useDeadLink(id: string): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    start();
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return dead[id]?.reason ?? null;
}
