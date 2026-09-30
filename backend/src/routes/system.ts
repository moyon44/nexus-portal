import { Router, Request, Response } from 'express';
import os from 'os';
import fs from 'fs';

const router = Router();

interface SystemStats {
  timestamp: string;
  cpu: {
    count: number;
    usage: number; // percentage
    model: string;
  };
  memory: {
    total: number; // bytes
    used: number; // bytes
    free: number; // bytes
    usage: number; // percentage
  };
  disk: {
    total: number; // bytes
    used: number; // bytes
    free: number; // bytes
    usage: number; // percentage
  };
  uptime: number; // seconds
  history: { t: number; cpu: number; ram: number }[];
}

/* CPU usage is a difference between two readings of the cumulative CPU times
 * (a single reading only gives the average since boot). A sampler takes one
 * reading every SAMPLE_INTERVAL and keeps an hour of CPU/RAM history for the
 * home page sparklines. */
const SAMPLE_INTERVAL = 15_000;
const HISTORY_SIZE = 240; // 1 hour

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

let lastTimes = cpuTimes();
let lastCpu = 0;
const history: { t: number; cpu: number; ram: number }[] = [];

function memoryUsage(): number {
  const total = os.totalmem();
  return total > 0 ? Math.round(((total - os.freemem()) / total) * 1000) / 10 : 0;
}

function sample() {
  const now = cpuTimes();
  const total = now.total - lastTimes.total;
  const idle = now.idle - lastTimes.idle;
  lastTimes = now;
  lastCpu = total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 1000) / 10)) : lastCpu;
  history.push({ t: Date.now(), cpu: lastCpu, ram: memoryUsage() });
  if (history.length > HISTORY_SIZE) history.shift();
}

// First reading after a short delta, then on the interval.
setTimeout(sample, 1_000);
setInterval(sample, SAMPLE_INTERVAL);

function getCpuUsage(): number {
  return lastCpu;
}

// Get disk usage via df command parsing
function getDiskUsage(): { total: number; used: number; free: number } {
  try {
    // Try to get root filesystem stats
    const stats = fs.statfsSync('/');

    const blockSize = stats.bsize;
    const total = stats.blocks * blockSize;
    const free = stats.bfree * blockSize;
    const used = total - free;

    return { total, used, free };
  } catch (e) {
    // Fallback values
    return { total: 0, used: 0, free: 0 };
  }
}

/**
 * GET /api/system/stats
 * Get system stats (CPU, RAM, Disk)
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    const disk = getDiskUsage();
    const diskUsagePercent = disk.total > 0 ? (disk.used / disk.total) * 100 : 0;

    const stats: SystemStats = {
      timestamp: new Date().toISOString(),
      cpu: {
        count: os.cpus().length,
        usage: getCpuUsage(),
        model: os.cpus()[0]?.model || 'Unknown',
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usage: Math.round(memoryUsagePercent * 100) / 100,
      },
      disk: {
        total: disk.total,
        used: disk.used,
        free: disk.free,
        usage: Math.round(diskUsagePercent * 100) / 100,
      },
      uptime: os.uptime(),
      history,
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Error getting system stats:', error);
    res.status(500).json({ error: 'Failed to get system stats' });
  }
});

export default router;
