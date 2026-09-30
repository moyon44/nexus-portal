import { useState, useEffect } from 'react';
import { DockerLog } from '../types';

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

const parseLogWithLevel = (logLine: string): DockerLog => {
  // Docker logs have format: TIMESTAMP STREAM_ID MESSAGE
  // Example: 2024-01-29T13:40:00.000000000Z stderr Some error message

  const timestampMatch = logLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^Z]*Z?)\s+(stdout|stderr)?\s+(.*)$/);

  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const stream = timestampMatch[2];
    const message = timestampMatch[3];

    // Determine log level based on content
    let level: DockerLog['level'] = 'info';
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('error') || lowerMessage.includes('failed') || stream === 'stderr') {
      level = 'error';
    } else if (lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
      level = 'warn';
    } else if (lowerMessage.includes('debug')) {
      level = 'debug';
    }

    return {
      timestamp: new Date(timestamp).toLocaleTimeString(),
      level,
      message,
    };
  }

  return {
    timestamp: new Date().toLocaleTimeString(),
    level: 'info',
    message: logLine,
  };
};

export const useDockerLogs = (containerId: string | null) => {
  const [logs, setLogs] = useState<DockerLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerId) {
      setLogs([]);
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connect = async () => {
      if (!isMounted) return;

      try {
        console.log(`[Docker Logs] Loading historical logs for container ${containerId}...`);
        setIsLoading(true);
        setError(null);

        // First, fetch historical logs
        const res = await fetch(`${API_URL}/api/docker/logs/${containerId}?lines=50`);
        if (res.ok) {
          const data = await res.json();
          const parsedLogs = (data.logs || []).map(parseLogWithLevel);
          if (isMounted) {
            console.log(`[Docker Logs] Loaded ${parsedLogs.length} historical logs`);
            setLogs(parsedLogs);
          }
        } else {
          if (isMounted) {
            setError(`Failed to load logs: ${res.statusText}`);
          }
        }

        if (!isMounted) return;
        setIsLoading(false);

        // Then, stream new logs
        console.log(`[Docker Logs] Opening stream for container ${containerId}...`);
        eventSource = new EventSource(`${API_URL}/api/docker/logs/stream/${containerId}`);

        eventSource.addEventListener('log', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            const newLog = parseLogWithLevel(data.log);
            if (isMounted) {
              setLogs((prev) => {
                // Keep last 100 logs
                const updated = [...prev, newLog];
                return updated.length > 100 ? updated.slice(-100) : updated;
              });
              setIsConnected(true);
              setError(null);
            }
          } catch (e) {
            console.error('Error parsing log event:', e);
          }
        });

        eventSource.addEventListener('connected', () => {
          if (isMounted) {
            console.log('[Docker Logs] SSE connected');
            setIsConnected(true);
            setError(null);
          }
        });

        eventSource.onerror = (e) => {
          if (isMounted) {
            console.error('[Docker Logs] SSE error:', e);
            setIsConnected(false);
            setError('Connection lost. Reconnecting...');
            eventSource?.close();

            // Try to reconnect after 3 seconds
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (e: any) {
        if (isMounted) {
          console.error('[Docker Logs] Failed to connect:', e);
          setError(e.message);
          setIsLoading(false);
          setIsConnected(false);

          // Try to reconnect after 3 seconds
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        console.log('[Docker Logs] EventSource closed');
      }
    };
  }, [containerId]);

  return { logs, isConnected, isLoading, error };
};
