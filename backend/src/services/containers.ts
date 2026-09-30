import { dockerService } from './docker.js';

/**
 * Every container with its CPU / RAM, sampled every 30 s with an hour of
 * history, for the System page. One sampler for all clients.
 */

const INTERVAL = 30_000;
const HISTORY = 120;
const CONCURRENCY = 6;

export interface ContainerOverview {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  cpu: number;
  ram: number;
  ramUsed: number;
  ramLimit: number;
  ports: number[];
  /** Network traffic, bytes per second (containers sharing a network namespace report the same). */
  rx: number;
  tx: number;
  history: { t: number; cpu: number; ram: number }[];
}

const overview = new Map<string, ContainerOverview>();
/** Last cumulative byte counters, to turn them into rates. */
const counters = new Map<string, { t: number; rx: number; tx: number }>();
let running = false;

async function sample() {
  if (running) return;
  running = true;
  try {
    const list = await dockerService.listContainers(true);
    const names = new Set(list.map((c) => c.name));
    for (const name of overview.keys()) if (!names.has(name)) overview.delete(name);

    const queue = [...list];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const prev = overview.get(c.name);
        const stats = c.state === 'running' ? await dockerService.getContainerStats(c.name).catch(() => null) : null;
        const cpu = stats ? Math.round(stats.cpu * 10) / 10 : 0;
        const ram = stats ? Math.round(stats.ram * 10) / 10 : 0;
        const now = Date.now();
        const last = counters.get(c.name);
        let rx = 0;
        let tx = 0;
        if (stats && last && now > last.t) {
          const dt = (now - last.t) / 1000;
          rx = Math.max(0, Math.round((stats.networkRx - last.rx) / dt));
          tx = Math.max(0, Math.round((stats.networkTx - last.tx) / dt));
        }
        if (stats) counters.set(c.name, { t: now, rx: stats.networkRx, tx: stats.networkTx });
        overview.set(c.name, {
          id: c.id,
          name: c.name,
          image: c.image,
          state: c.state,
          status: c.status,
          cpu,
          ram,
          ramUsed: stats?.ramUsed ?? 0,
          ramLimit: stats?.ramLimit ?? 0,
          ports: c.ports,
          rx,
          tx,
          history: [...(prev?.history ?? []), { t: Date.now(), cpu, ram }].slice(-HISTORY),
        });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } catch (e: any) {
    console.error('Container sampler error:', e.message);
  } finally {
    running = false;
  }
}

export function getOverview(): ContainerOverview[] {
  return [...overview.values()].sort((a, b) => b.cpu - a.cpu);
}

export function startContainerSampler() {
  sample();
  setInterval(sample, INTERVAL);
}
