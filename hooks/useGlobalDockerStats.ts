import { useEffect, useState } from 'react';
import { dockerApi } from '../api';

interface AggregatedDockerStats {
  timestamp: string;
  totalContainers: number;
  runningContainers: number;
  stoppedContainers: number;
  aggregatedMetrics: {
    avgCpuPercent: number;
    totalRamPercent: number;
    totalRamUsed: number;
    totalRamLimit: number;
    totalNetworkRx: number;
    totalNetworkTx: number;
  };
}

interface UseGlobalDockerStatsReturn {
  stats: AggregatedDockerStats | null;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export const useGlobalDockerStats = (enabled: boolean = true): UseGlobalDockerStatsReturn => {
  const [stats, setStats] = useState<AggregatedDockerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const fetchStats = async () => {
      try {
        const data = await dockerApi.getAggregatedStats();
        if (isMounted) {
          setStats(data);
          setIsConnected(true);
          setError(null);
          setLastUpdate(new Date());
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Docker stats';
          setError(errorMessage);
          setIsConnected(false);
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    fetchStats();

    // Poll every 2 seconds
    const interval = setInterval(fetchStats, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [enabled]);

  return {
    stats,
    isLoading,
    isConnected,
    error,
    lastUpdate,
  };
};
