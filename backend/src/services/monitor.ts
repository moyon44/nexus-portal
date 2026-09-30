import http from 'http';
import https from 'https';
import { URL } from 'url';
import db from '../db.js';
import { dockerService } from './docker.js';

/**
 * Background health monitor for the home page tiles, in the spirit of Uptime
 * Kuma: every CHECK_INTERVAL each visible service is probed once (Docker
 * state when the service is bound to a container, HTTP otherwise), and the
 * last HISTORY_SIZE results are kept in memory with their latency.
 *
 * Clients read the cache (GET /api/services/health), so polling from many
 * tabs never multiplies the probes.
 */

const CHECK_INTERVAL = 30_000;
const HISTORY_SIZE = 60; // 30 minutes at one check every 30 s
const HTTP_TIMEOUT = 4_000;

export type HealthStatus = 'online' | 'offline';

export interface HealthSample {
  /** Epoch ms of the check. */
  t: number;
  up: boolean;
  /** HTTP round trip in ms, null when the request failed. */
  ms: number | null;
}

export interface ServiceHealth {
  status: HealthStatus;
  latency: number | null;
  history: HealthSample[];
  /** Container CPU / RAM (percent) for services bound to Docker. */
  container?: { name: string; cpu: number; ram: number };
  checkedAt: number;
  /** Share of successful checks, in percent (from the database). */
  uptime24h: number | null;
  uptime7d: number | null;
}

/** Probes a URL: HEAD first, GET when HEAD is refused. 2xx/3xx, or 401/403 behind a login, count as up. */
export function probeUrl(urlString: string, timeout = HTTP_TIMEOUT): Promise<{ ok: boolean; ms: number | null }> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      resolve({ ok: false, ms: null });
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;

    const attempt = (method: 'HEAD' | 'GET') => {
      const start = performance.now();
      let settled = false;
      const done = (result: { ok: boolean; ms: number | null } | 'retry') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.destroy();
        if (result === 'retry') attempt('GET');
        else resolve(result);
      };
      const timer = setTimeout(() => done({ ok: false, ms: null }), timeout);
      const req = lib.request(url, { method, timeout, rejectUnauthorized: false }, (res) => {
        const code = res.statusCode ?? 0;
        res.resume();
        // Some servers reject HEAD (405/501): retry once with GET.
        if (method === 'HEAD' && (code === 405 || code === 501)) return done('retry');
        const ok = (code >= 200 && code < 400) || code === 401 || code === 403;
        done({ ok, ms: Math.round(performance.now() - start) });
      });
      req.on('error', () => done(method === 'HEAD' ? 'retry' : { ok: false, ms: null }));
      req.on('timeout', () => done({ ok: false, ms: null }));
      req.end();
    };

    attempt('HEAD');
  });
}

const health = new Map<string, ServiceHealth>();
let running = false;

/* ----- Persistence: every sample goes to health_samples (7 days) -------- */

const RETENTION_DAYS = 7;
let pending: { service_id: string; t: Date; up: boolean; ms: number | null }[] = [];
let uptime = new Map<string, { d1: number | null; d7: number | null }>();
let lastAggregate = 0;
let lastPrune = 0;

async function flushSamples() {
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  await db('health_samples').insert(batch).catch((e: any) => console.error('health_samples insert:', e.message));
}

async function refreshUptime() {
  if (Date.now() - lastAggregate < 5 * 60_000) return;
  lastAggregate = Date.now();
  const rows = await db('health_samples')
    .select('service_id')
    .select(db.raw(`avg(case when up then 100.0 else 0 end) filter (where t > now() - interval '1 day') as d1`))
    .select(db.raw('avg(case when up then 100.0 else 0 end) as d7'))
    .where('t', '>', db.raw(`now() - interval '${RETENTION_DAYS} days'`))
    .groupBy('service_id');
  uptime = new Map(
    rows.map((r: any) => [
      r.service_id,
      { d1: r.d1 === null ? null : Math.round(Number(r.d1) * 100) / 100, d7: r.d7 === null ? null : Math.round(Number(r.d7) * 100) / 100 },
    ]),
  );
  for (const [id, h] of health) {
    const u = uptime.get(id);
    h.uptime24h = u?.d1 ?? null;
    h.uptime7d = u?.d7 ?? null;
  }
}

/**
 * Rolls samples up into health_daily (per service and Paris day): checks,
 * checks up, outages (2+ failed checks in a row, like the Island) and the
 * longest one. Days still fully covered by samples are recomputed each time;
 * older days keep the row written while their samples existed.
 */
async function rollupDays() {
  await db.raw(`
    with s as (
      select service_id, t, up, (t at time zone 'Europe/Paris')::date as day,
             lag(up) over (partition by service_id order by t) as prev_up
      from health_samples
      where t >= now() - interval '${RETENTION_DAYS} days'
    ),
    runs as (
      select *, sum(case when up is distinct from prev_up then 1 else 0 end)
                  over (partition by service_id order by t) as grp
      from s
    ),
    downs as (
      select service_id, min(day) as day, extract(epoch from max(t) - min(t))::int + 30 as secs
      from runs where not up
      group by service_id, grp
      having count(*) >= 2
    ),
    days as (
      select service_id, day, count(*)::int as samples, (count(*) filter (where up))::int as up_samples
      from s
      where day > ((now() - interval '${RETENTION_DAYS} days') at time zone 'Europe/Paris')::date
      group by service_id, day
    )
    insert into health_daily (service_id, day, samples, up_samples, outages, longest_down_s)
    select d.service_id, d.day, d.samples, d.up_samples,
           coalesce((select count(*) from downs o where o.service_id = d.service_id and o.day = d.day), 0),
           coalesce((select max(secs) from downs o where o.service_id = d.service_id and o.day = d.day), 0)
    from days d
    on conflict (service_id, day) do update set
      samples = excluded.samples, up_samples = excluded.up_samples,
      outages = excluded.outages, longest_down_s = excluded.longest_down_s
  `);
}

async function prune() {
  if (Date.now() - lastPrune < 3600_000) return;
  lastPrune = Date.now();
  await rollupDays().catch((e: any) => console.error('health_daily rollup:', e.message));
  await db('health_samples').where('t', '<', db.raw(`now() - interval '${RETENTION_DAYS} days'`)).delete();
}

/** For the Wrapped: brings today's row up to date before it is read. */
let lastRollup = 0;
export async function freshRollup() {
  if (Date.now() - lastRollup < 5 * 60_000) return;
  lastRollup = Date.now();
  await rollupDays().catch((e: any) => console.error('health_daily rollup:', e.message));
}

/** Restores the recent history after a restart. */
async function loadHistory() {
  const rows = await db
    .select('service_id', 't', 'up', 'ms')
    .from(
      db('health_samples')
        .select('service_id', 't', 'up', 'ms')
        .select(db.raw('row_number() over (partition by service_id order by t desc) as rn'))
        .as('s'),
    )
    .where('rn', '<=', HISTORY_SIZE)
    .orderBy('t', 'asc');
  const byService = new Map<string, HealthSample[]>();
  for (const r of rows) {
    const list = byService.get(r.service_id) ?? [];
    list.push({ t: new Date(r.t).getTime(), up: r.up, ms: r.ms });
    byService.set(r.service_id, list);
  }
  for (const [id, history] of byService) {
    const last = history[history.length - 1];
    health.set(id, {
      status: last.up ? 'online' : 'offline',
      latency: last.ms,
      history,
      checkedAt: last.t,
      uptime24h: null,
      uptime7d: null,
    });
  }
}

function parseStats(raw: unknown): any {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function checkService(service: any): Promise<void> {
  const stats = parseStats(service.stats);
  const containerName: string | undefined =
    stats?.dockerEnabled && stats?.dockerContainer ? stats.dockerContainer : undefined;

  const [probe, container] = await Promise.all([
    probeUrl(service.url),
    containerName ? dockerService.getContainerStats(containerName).catch(() => null) : Promise.resolve(null),
  ]);

  // A container-bound service is up when its container runs; the HTTP probe
  // then only provides the latency.
  const up = containerName ? container?.status === 'running' : probe.ok;
  const sample: HealthSample = { t: Date.now(), up, ms: probe.ok ? probe.ms : null };

  const prev = health.get(service.id);
  const history = [...(prev?.history ?? []), sample].slice(-HISTORY_SIZE);
  pending.push({ service_id: service.id, t: new Date(sample.t), up, ms: sample.ms });
  const u = uptime.get(service.id);
  health.set(service.id, {
    uptime24h: u?.d1 ?? null,
    uptime7d: u?.d7 ?? null,
    status: up ? 'online' : 'offline',
    latency: sample.ms,
    history,
    container:
      containerName && container
        ? { name: containerName, cpu: Math.round(container.cpu * 10) / 10, ram: Math.round(container.ram * 10) / 10 }
        : undefined,
    checkedAt: sample.t,
  });
}

export async function runChecks(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const services = await db('services').select('id', 'name', 'url', 'stats').where('is_visible', true);
    const ids = new Set(services.map((s: any) => s.id));
    for (const id of health.keys()) if (!ids.has(id)) health.delete(id);
    await Promise.all(services.map((s: any) => checkService(s).catch(() => undefined)));
    await flushSamples();
    await refreshUptime();
    await prune();
  } catch (error: any) {
    console.error('Health monitor error:', error.message);
  } finally {
    running = false;
  }
}

/** Re-checks one service right away (after it was created or edited). */
export async function checkNow(id: string): Promise<void> {
  const service = await db('services').select('id', 'name', 'url', 'stats').where({ id }).first();
  if (service) await checkService(service).catch(() => undefined);
}

export function getHealth(): Record<string, ServiceHealth> {
  return Object.fromEntries(health);
}

export async function startMonitor(): Promise<void> {
  await loadHistory().catch((e: any) => console.error('Health history load failed:', e.message));
  runChecks();
  setInterval(runChecks, CHECK_INTERVAL);
  console.log(`✓ Health monitor started (every ${CHECK_INTERVAL / 1000}s)`);
}
