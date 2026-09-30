import { useCallback, useEffect, useState } from 'react';
import { haApi } from '../api';
import type { HaWidgetsData } from '../types';

/**
 * Home Assistant widgets and the live state they need, every 30 s (and
 * right after a command). `error` is set when Home Assistant doesn't answer;
 * the widget list itself may still be there.
 */
export function useHaWidgets(enabled = true) {
  const [data, setData] = useState<HaWidgetsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      haApi
        .widgets()
        .then(d => {
          setData(d);
          setError(null);
        })
        .catch(e => setError(e instanceof Error ? e.message : 'Home Assistant indisponible')),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => !document.hidden && load(), 30_000);
    return () => clearInterval(t);
  }, [enabled, load]);

  return { data, error, reload: load };
}
