import { useEffect, useState } from 'react';
import { systemApi } from '../api';

export interface SystemStats {
  timestamp: string;
  cpu: {
    count: number;
    usage: number;
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  uptime: number;
  /** One sample every 15 s over the last hour. */
  history?: { t: number; cpu: number; ram: number }[];
}

interface UseSystemStatsReturn {
  stats: SystemStats | null;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export const useSystemStats = (enabled: boolean = true): UseSystemStatsReturn => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const fetchStats = async () => {
      try {
        const data = await systemApi.getStats();
        if (isMounted) {
          setStats(data);
          setError(null);
          setLastUpdate(new Date());
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch system stats';
          setError(errorMessage);
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    fetchStats();

    // The backend samples every 15 s.
    const interval = setInterval(fetchStats, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [enabled]);

  return {
    stats,
    isLoading,
    error,
    lastUpdate,
  };
};
