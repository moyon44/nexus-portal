/**
 * Docker-related interfaces for backend
 */

export interface DockerStats {
  cpu: number; // CPU percentage
  ram: number; // RAM percentage
  ramUsed: number; // RAM used in bytes
  ramLimit: number; // RAM limit in bytes
  networkRx: number; // Network RX bytes
  networkTx: number; // Network TX bytes
  diskRead: number; // Disk read bytes
  diskWrite: number; // Disk write bytes
  uptime: string; // Uptime formatted (e.g., "2d 3h")
  status: 'running' | 'stopped' | 'paused' | 'unknown';
}

export interface DockerLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface ServiceStats {
  dockerContainer?: string;
  dockerEnabled?: boolean;
  cpu?: number;
  ram?: number;
  disk?: number;
  uptime?: string;
  networkRx?: number;
  networkTx?: number;
  alertThresholds?: {
    cpuPercent?: number;
    ramPercent?: number;
  };
}

export interface AggregatedDockerStats {
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
