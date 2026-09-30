import { useState, useEffect } from 'react';
import { DockerStats } from '../types';

// Match the getApiUrl logic from api.ts
const getApiUrl = () => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000';
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}`;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return 'http://localhost:5000';
};

const API_URL = getApiUrl();

export const useDockerStats = (containerId: string, enabled: boolean) => {
  const [stats, setStats] = useState<DockerStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStats(null);
      setIsConnected(false);
      return;
    }

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const pollStats = async () => {
      if (!isMounted) return;

      try {
        // Fetch stats directly instead of using EventSource (Cloudflare compatible)
        const res = await fetch(`${API_URL}/api/docker/stats/${containerId}`);

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            console.log(`[Docker Stats] Received stats for container ${containerId}:`, data);
            setStats(data);
            setIsConnected(true);
            setError(null);
          }
        } else if (res.status === 404) {
          if (isMounted) {
            setError('Container not found');
            setIsConnected(false);
          }
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (e: any) {
        if (isMounted) {
          console.error('[Docker Stats] Poll error:', e.message);
          setError(`Connection error: ${e.message}`);
          setIsConnected(false);
        }
      }
    };

    // Poll every 2 seconds
    console.log(`[Docker Stats] Starting long polling for container ${containerId}`);
    pollStats();
    pollInterval = setInterval(pollStats, 2000);

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
        console.log('[Docker Stats] Long polling stopped');
      }
    };
  }, [containerId, enabled]);

  return { stats, isConnected, error };
};
