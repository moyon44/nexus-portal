import { Router, Request, Response } from 'express';
import db from '../db.js';
import { freshRollup } from '../services/monitor.js';

/**
 * Nexus Wrapped: a month in numbers, for the story in the frontend
 * (components/Wrapped.tsx). Everything is counted in Paris time.
 *
 * GET /api/wrapped?month=YYYY-MM   (default: the current month)
 *
 * Opens come from access_logs; uptime and outages from health_daily (rolled
 * up from the health checks, kept beyond their 7 days).
 */
const router = Router();
const TZ = 'Europe/Paris';

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
    const current = today.slice(0, 7);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month)) ? String(req.query.month) : current;
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const isCurrent = month === current;
    const lastDay = isCurrent ? today : addDays(next, -1);
    const daysInPeriod = Math.round((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;

    if (isCurrent) await freshRollup();

    const local = `(accessed_at at time zone '${TZ}')`;
    const opens: { service_id: string; at: string }[] = await db('access_logs')
      .select('service_id', db.raw(`to_char(${local}, 'YYYY-MM-DD"T"HH24:MI') as at`))
      .whereRaw(`${local} >= ?::timestamp and ${local} < ?::timestamp`, [start, next])
      .orderBy('accessed_at', 'asc');

    const services = await db('services').select('id', 'created_at');
    const known = new Set(services.map((s: any) => s.id));

    // ---- Opens -----------------------------------------------------------
    const hours = Array(24).fill(0);
    const weekdays = Array(7).fill(0); // Monday first
    const perDay = new Map<string, number>();
    const perService = new Map<string, number>();
    for (const o of opens) {
      const [date, time] = o.at.split('T');
      const h = Number(time.slice(0, 2));
      hours[h]++;
      weekdays[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]++;
      perDay.set(date, (perDay.get(date) ?? 0) + 1);
      perService.set(o.service_id, (perService.get(o.service_id) ?? 0) + 1);
    }
    const top = [...perService.entries()]
      .filter(([id]) => known.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([serviceId, count]) => ({ serviceId, count }));

    let busiestDay: { date: string; count: number } | null = null;
    for (const [date, count] of perDay) if (!busiestDay || count > busiestDay.count) busiestDay = { date, count };

    // Longest run of consecutive days with at least one open.
    const days = [...perDay.keys()].sort();
    let longestStreak: { days: number; from: string; to: string } | null = null;
    let runStart = days[0];
    for (let i = 0; i < days.length; i++) {
      if (i > 0 && addDays(days[i - 1], 1) !== days[i]) runStart = days[i];
      const len = Math.round((Date.parse(`${days[i]}T12:00:00Z`) - Date.parse(`${runStart}T12:00:00Z`)) / 86_400_000) + 1;
      if (!longestStreak || len > longestStreak.days) longestStreak = { days: len, from: runStart, to: days[i] };
    }

    // Links opened for the very first time this month.
    const firsts: { service_id: string; first: string }[] = await db('access_logs')
      .select('service_id', db.raw(`to_char(min(${local}), 'YYYY-MM-DD"T"HH24:MI') as first`))
      .groupBy('service_id')
      .havingRaw(`min(${local}) >= ?::timestamp and min(${local}) < ?::timestamp`, [start, next]);
    const discoveries = firsts
      .filter(f => known.has(f.service_id))
      .sort((a, b) => a.first.localeCompare(b.first))
      .slice(0, 8)
      .map(f => ({ serviceId: f.service_id, at: f.first }));

    const added = services
      .filter((s: any) => {
        const d = new Date(s.created_at).toLocaleDateString('sv-SE', { timeZone: TZ });
        return d >= start && d < next;
      })
      .map((s: any) => s.id);

    // ---- Health ----------------------------------------------------------
    const daily: any[] = await db('health_daily')
      .whereIn('service_id', [...known])
      .andWhere('day', '>=', start)
      .andWhere('day', '<', next);
    const byService = new Map<string, { samples: number; up: number; outages: number }>();
    const byDay = new Map<string, { samples: number; up: number }>();
    let longestOutage: { serviceId: string; seconds: number; day: string } | null = null;
    let outages = 0;
    for (const r of daily) {
      const day = typeof r.day === 'string' ? r.day.slice(0, 10) : new Date(r.day).toLocaleDateString('sv-SE');
      const s = byService.get(r.service_id) ?? { samples: 0, up: 0, outages: 0 };
      s.samples += r.samples;
      s.up += r.up_samples;
      s.outages += r.outages;
      byService.set(r.service_id, s);
      const d = byDay.get(day) ?? { samples: 0, up: 0 };
      d.samples += r.samples;
      d.up += r.up_samples;
      byDay.set(day, d);
      outages += r.outages;
      if (r.longest_down_s > 0 && (!longestOutage || r.longest_down_s > longestOutage.seconds)) {
        longestOutage = { serviceId: r.service_id, seconds: r.longest_down_s, day };
      }
    }
    const pct = (up: number, n: number) => Math.round((up / n) * 10000) / 100;
    const ranked = [...byService.entries()]
      .filter(([, s]) => s.samples >= 20)
      .map(([serviceId, s]) => ({ serviceId, uptime: pct(s.up, s.samples), checks: s.samples, outages: s.outages }))
      .sort((a, b) => b.uptime - a.uptime || b.checks - a.checks);
    const checks = [...byService.values()].reduce((n, s) => n + s.samples, 0);
    const up = [...byService.values()].reduce((n, s) => n + s.up, 0);

    // ---- Months that have something to show ------------------------------
    const monthRows: { k: string }[] = await db.raw(`
      select distinct to_char(accessed_at at time zone '${TZ}', 'YYYY-MM') as k from access_logs
      union select distinct to_char(day, 'YYYY-MM') from health_daily
      order by 1 desc limit 24`).then((r: any) => r.rows);
    const months = [...new Set([current, ...monthRows.map(r => r.k)])].sort().reverse().map(k => ({ key: k, label: monthLabel(k) }));

    const theme = await db('theme_config').first();

    res.json({
      month,
      label: monthLabel(month),
      isCurrent,
      months,
      userName: theme?.user_name || '',
      opens: {
        total: opens.length,
        activeDays: perDay.size,
        daysInPeriod,
        longestStreak,
        busiestDay,
        hours,
        weekdays,
        night: hours.slice(0, 5).reduce((a, b) => a + b, 0),
        early: hours.slice(5, 8).reduce((a, b) => a + b, 0),
        distinctServices: [...perService.keys()].filter(id => known.has(id)).length,
        totalServices: known.size,
      },
      top,
      discoveries,
      added,
      health: {
        checks,
        uptime: checks ? pct(up, checks) : null,
        outages,
        longestOutage,
        mostReliable: ranked[0] ?? null,
        leastReliable: ranked.length > 1 && ranked[ranked.length - 1].uptime < 100 ? ranked[ranked.length - 1] : null,
        perfectDays: [...byDay.values()].filter(d => d.samples > 0 && d.up === d.samples).length,
        daysMeasured: byDay.size,
      },
    });
  } catch (error) {
    console.error('wrapped:', error);
    res.status(500).json({ error: 'Failed to build the Wrapped' });
  }
});

export default router;
