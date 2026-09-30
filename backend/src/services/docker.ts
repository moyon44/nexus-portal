import Docker, { Container, ContainerInfo } from 'dockerode';
import { DockerStats, AggregatedDockerStats } from '../types';

export interface DockerContainerInfo {
  id: string;
  name: string;
  status: string;
  image: string;
  state: string;
  labels: Record<string, string>;
  /** Published TCP ports on the host (e.g. 8096). */
  ports: number[];
}

class DockerService {
  private docker: Docker;
  private statsCache: Map<string, { data: DockerStats; timestamp: number }> = new Map();
  private aggregatedStatsCache: { data: AggregatedDockerStats; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Get container stats with caching
   */
  async getContainerStats(containerId: string): Promise<DockerStats | null> {
    try {
      // Check cache first
      const cached = this.statsCache.get(containerId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }

      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      const containerInfo = await container.inspect();

      const result = this.calculateStats(stats, containerInfo);

      // Cache the result
      this.statsCache.set(containerId, { data: result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      console.error(`Error getting stats for ${containerId}:`, error.message);
      // Try to at least get the container status
      try {
        const container = this.docker.getContainer(containerId);
        const containerInfo = await container.inspect();
        const status = (containerInfo?.State?.Status === 'running' ? 'running' : 'stopped') as 'running' | 'stopped' | 'paused' | 'unknown';

        const minimalStats: DockerStats = {
          cpu: 0,
          ram: 0,
          ramUsed: 0,
          ramLimit: 0,
          networkRx: 0,
          networkTx: 0,
          diskRead: 0,
          diskWrite: 0,
          uptime: 'unknown',
          status,
        };

        // Cache the minimal stats
        this.statsCache.set(containerId, { data: minimalStats, timestamp: Date.now() });
        return minimalStats;
      } catch (inspectError: any) {
        console.error(`Error inspecting container ${containerId}:`, inspectError.message);
        // Return cached data if available, even if expired
        const cached = this.statsCache.get(containerId);
        if (cached) {
          return cached.data;
        }
        return null;
      }
    }
  }

  /**
   * Stream container stats (used for SSE)
   */
  async streamContainerStats(containerId: string, callback: (stats: DockerStats) => void): Promise<any> {
    try {
      const container = this.docker.getContainer(containerId);
      const containerInfo = await container.inspect();
      const statsStream = await container.stats({ stream: true });

      let buffer = '';

      (statsStream as any).on('data', (chunk: any) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        lines.forEach((line: string) => {
          try {
            if (line.trim()) {
              const statsData = JSON.parse(line);
              const stats = this.calculateStats(statsData, containerInfo);
              callback(stats);
            }
          } catch (error) {
            // Ignore JSON parse errors
          }
        });
      });

      (statsStream as any).on('error', (error: any) => {
        console.error(`Error streaming stats for ${containerId}:`, error);
      });

      return statsStream;
    } catch (error: any) {
      console.error(`Error starting stats stream for ${containerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get container logs (historical)
   */
  async getLogs(containerId: string, lines = 100): Promise<string[]> {
    try {
      const container = this.docker.getContainer(containerId);
      const logsStream = await container.logs({
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: lines,
      });

      return new Promise((resolve, reject) => {
        let logData = '';

        // Handle both stream and buffer responses from dockerode
        if (Buffer.isBuffer(logsStream)) {
          // If logsStream is a Buffer, convert it directly
          const logLines = logsStream
            .toString('utf-8')
            .split('\n')
            .filter((line) => line.trim());
          resolve(logLines);
        } else if (typeof logsStream === 'string') {
          // If it's a string
          const logLines = (logsStream as string).split('\n').filter((line: string) => line.trim());
          resolve(logLines);
        } else if ((logsStream as any).on && typeof (logsStream as any).on === 'function') {
          // If it's a stream with event handlers
          (logsStream as any).on('data', (chunk: any) => {
            logData += chunk.toString('utf-8');
          });

          (logsStream as any).on('end', () => {
            const logLines = logData.split('\n').filter((line) => line.trim());
            resolve(logLines);
          });

          (logsStream as any).on('error', (error: any) => {
            console.error(`Error getting logs for ${containerId}:`, error);
            reject(error);
          });
        } else {
          console.warn(`Unexpected logsStream type for ${containerId}:`, typeof logsStream);
          resolve([]);
        }
      });
    } catch (error: any) {
      console.error(`Error getting logs for ${containerId}:`, error.message);
      return [];
    }
  }

  /**
   * Stream container logs (for SSE)
   */
  async streamLogs(containerId: string, callback: (log: string) => void): Promise<NodeJS.ReadableStream> {
    try {
      const container = this.docker.getContainer(containerId);
      const logsStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        timestamps: true,
        tail: 100,
      });

      // Ensure logsStream has event handlers
      if ((logsStream as any).on && typeof (logsStream as any).on === 'function') {
        logsStream.on('data', (chunk) => {
          const log = chunk.toString('utf-8');
          callback(log);
        });

        logsStream.on('error', (error) => {
          console.error(`Error streaming logs for ${containerId}:`, error);
        });
      } else {
        console.warn(`streamLogs: logsStream does not support event handlers for ${containerId}`);
      }

      return logsStream as NodeJS.ReadableStream;
    } catch (error: any) {
      console.error(`Error starting logs stream for ${containerId}:`, error.message);
      throw error;
    }
  }

  /**
   * List all containers
   */
  async listContainers(all = false): Promise<DockerContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all });
      return containers.map((c) => ({
        id: c.Id.substring(0, 12),
        name: c.Names[0]?.replace(/^\//, '') || 'unknown',
        status: c.Status,
        image: c.Image,
        state: c.State,
        labels: c.Labels || {},
        ports: [...new Set((c.Ports || []).filter((p) => p.PublicPort && p.Type === 'tcp').map((p) => p.PublicPort as number))].sort((a, b) => a - b),
      }));
    } catch (error: any) {
      console.error('Error listing containers:', error.message);
      return [];
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.restart();
      // Clear cache for this container
      this.statsCache.delete(containerId);
      return true;
    } catch (error: any) {
      console.error(`Error restarting container ${containerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop();
      // Clear cache for this container
      this.statsCache.delete(containerId);
      return true;
    } catch (error: any) {
      console.error(`Error stopping container ${containerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
      // Clear cache for this container
      this.statsCache.delete(containerId);
      return true;
    } catch (error: any) {
      console.error(`Error starting container ${containerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate stats from raw Docker stats data
   */
  private calculateStats(statsData: any, containerInfo: any): DockerStats {
    try {
      const cpuStats = statsData.cpu_stats || {};
      const precpuStats = statsData.precpu_stats || {};
      const memoryStats = statsData.memory_stats || {};
      const networks = statsData.networks || {};

      // Calculate CPU percentage
      const cpuDelta = (cpuStats.cpu_usage?.total_usage || 0) - (precpuStats.cpu_usage?.total_usage || 0);
      const systemDelta = (cpuStats.system_cpu_usage || 0) - (precpuStats.system_cpu_usage || 0);
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * (cpuStats.online_cpus || 1) * 100 : 0;

      // Calculate memory percentage
      const memoryUsage = memoryStats.usage || 0;
      const memoryLimit = memoryStats.limit || 1;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;

      // Calculate network I/O (sum of all interfaces)
      let networkRx = 0;
      let networkTx = 0;
      Object.values(networks).forEach((net: any) => {
        networkRx += net.rx_bytes || 0;
        networkTx += net.tx_bytes || 0;
      });

      // Calculate uptime from container start time
      let uptime = 'unknown';
      if (containerInfo?.State?.StartedAt) {
        const startTime = new Date(containerInfo.State.StartedAt).getTime();
        const upTimeMs = Date.now() - startTime;
        uptime = this.formatUptime(upTimeMs);
      }

      // Get container status
      const containerStatus = containerInfo?.State?.Status || 'unknown';
      const status = (containerStatus === 'running' ? 'running' : 'stopped') as 'running' | 'stopped' | 'paused' | 'unknown';

      return {
        cpu: Math.round(cpuPercent * 100) / 100,
        ram: Math.round(memoryPercent * 100) / 100,
        ramUsed: memoryUsage,
        ramLimit: memoryLimit,
        networkRx,
        networkTx,
        diskRead: 0,
        diskWrite: 0,
        uptime,
        status,
      };
    } catch (error) {
      console.error('Error calculating stats:', error);
      return {
        cpu: 0,
        ram: 0,
        ramUsed: 0,
        ramLimit: 0,
        networkRx: 0,
        networkTx: 0,
        diskRead: 0,
        diskWrite: 0,
        uptime: 'error',
        status: 'unknown',
      };
    }
  }

  /**
   * Format uptime duration
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get aggregated stats for all running containers
   */
  async getAggregatedStats(): Promise<AggregatedDockerStats | null> {
    try {
      // Check cache first
      if (this.aggregatedStatsCache && Date.now() - this.aggregatedStatsCache.timestamp < this.CACHE_TTL) {
        return this.aggregatedStatsCache.data;
      }

      const containers = await this.docker.listContainers({ all: true });
      console.log(`[getAggregatedStats] Found ${containers.length} containers`);
      let totalCpuSum = 0;
      let totalRamUsed = 0;
      let totalRamLimit = 0;
      let totalNetworkRx = 0;
      let totalNetworkTx = 0;
      let runningCount = 0;
      let stoppedCount = 0;

      // Fetch stats for each container
      for (const container of containers) {
        try {
          const stats = await this.getContainerStats(container.Id);
          if (stats) {
            if (stats.status === 'running') {
              runningCount++;
              totalCpuSum += stats.cpu;
              totalRamUsed += stats.ramUsed;
              totalRamLimit += stats.ramLimit;
              totalNetworkRx += stats.networkRx;
              totalNetworkTx += stats.networkTx;
            } else {
              stoppedCount++;
            }
          }
        } catch (e) {
          // Skip containers with errors
          if (container.State === 'running') {
            runningCount++;
          } else {
            stoppedCount++;
          }
        }
      }

      // Calculate aggregated metrics
      const avgCpuPercent = runningCount > 0 ? totalCpuSum / runningCount : 0;
      const totalRamPercent = totalRamLimit > 0 ? (totalRamUsed / totalRamLimit) * 100 : 0;

      const result: AggregatedDockerStats = {
        timestamp: new Date().toISOString(),
        totalContainers: containers.length,
        runningContainers: runningCount,
        stoppedContainers: stoppedCount,
        aggregatedMetrics: {
          avgCpuPercent: Math.round(avgCpuPercent * 100) / 100,
          totalRamPercent: Math.round(totalRamPercent * 100) / 100,
          totalRamUsed,
          totalRamLimit,
          totalNetworkRx,
          totalNetworkTx,
        },
      };

      // Cache the result
      this.aggregatedStatsCache = { data: result, timestamp: Date.now() };
      return result;
    } catch (error) {
      console.error('Error getting aggregated Docker stats:', error);
      return null;
    }
  }

  /**
   * Test Docker connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      console.error('Docker connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const dockerService = new DockerService();
