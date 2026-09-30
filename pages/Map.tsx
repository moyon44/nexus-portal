import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { RiAddLine, RiCloseLine, RiExternalLinkLine, RiFocus3Line, RiRestartLine, RiSearchLine, RiServerLine, RiSubtractLine } from '@remixicon/react';
import { topologyApi, dockerApi } from '../api';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { containerOf, openService } from '../lib/actions';
import { useSystemStats } from '../hooks/useSystemStats';
import { reducedMotion } from '../lib/motion';
import type { Service, TopoContainer, Topology } from '../types';
import { LinkIcon } from '../components/LinkIcon';
import { DockerLogViewer } from '../components/DockerLogViewer';
import { Button } from '../components/ui/button';
import { cx } from '../utils/cx';

/**
 * Carte de l'infra: every container, its networks and the server, laid out
 * by a force simulation (d3-force), with the live traffic running along the
 * links as particles (↓ received in the accent, ↑ sent in green; rates from
 * the container sampler, refreshed every 15 s).
 *
 *  - Containers are grouped in soft zones by compose project.
 *  - A container living in another's network (network_mode: service:vpn)
 *    is tied to it by a thick tube: the VPN tunnel.
 *  - Size follows RAM, the ring CPU; stopped ones are dashed, down ones red.
 *  - Wheel to zoom, drag the ground to pan, drag a node to move it; hover
 *    lights up its neighbours; click for details, logs and restart.
 */

type Kind = 'host' | 'net' | 'ctr';
interface N extends SimulationNodeDatum {
  id: string;
  kind: Kind;
  label: string;
  r: number;
  c?: TopoContainer;
  project?: string | null;
}
interface L extends SimulationLinkDatum<N> {
  id: string;
  kind: 'net' | 'hub' | 'via';
  rx: number;
  tx: number;
}

const rate = (b: number) => {
  if (b < 1024) return `${b} o/s`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1).replace('.', ',')} Ko/s`;
  return `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} Mo/s`;
};
const hue = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
const nodeR = (c: TopoContainer) => 17 + Math.min(10, c.ram / 8);

/** Convex hull (monotone chain). */
function hull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: [number, number][] = [];
  for (const pt of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Resolves a CSS colour (tokens, color-mix…) to something a canvas accepts. */
function resolveColor(css: string): string {
  const probe = document.createElement('span');
  probe.style.color = css;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

export const MapPage: React.FC = () => {
  const { data } = useDashboard();
  const { notify } = useShell();
  const { stats } = useSystemStats(true);
  const [topo, setTopo] = useState<Topology | null>(null);
  const [, setFrame] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Simulation<N, L> | null>(null);
  const nodes = useRef(new Map<string, N>());
  const links = useRef<L[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef(false);

  // Tiles bound to a container lend it their logo, name and address.
  const tileFor = useMemo(() => {
    const map = new Map<string, Service>();
    for (const s of data.services) {
      const c = containerOf(s) ?? data.health[s.id]?.container?.name;
      if (c && !map.has(c)) map.set(c, s);
    }
    return map;
  }, [data.services, data.health]);

  const load = useCallback(() => topologyApi.get().then(setTopo).catch(() => undefined), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Size of the drawing area.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build / merge the graph; positions survive refreshes.
  useEffect(() => {
    if (!topo) return;
    const prev = nodes.current;
    const next = new Map<string, N>();
    const keep = (n: N, near?: string) => {
      const old = prev.get(n.id);
      const anchor = near ? prev.get(near) ?? next.get(near) : undefined;
      next.set(n.id, old ? Object.assign(old, { label: n.label, r: n.r, c: n.c, project: n.project }) : { ...n, x: (anchor?.x ?? 0) + (Math.random() - 0.5) * 80, y: (anchor?.y ?? 0) + (Math.random() - 0.5) * 80 });
    };
    keep({ id: 'host', kind: 'host', label: 'Serveur', r: 34, fx: 0, fy: 0 } as N);
    for (const n of topo.networks) if (n.name !== 'host') keep({ id: `net:${n.name}`, kind: 'net', label: n.name, r: 22 }, 'host');
    for (const c of topo.containers) {
      const near = c.via ? `ctr:${c.via}` : c.networks[0] && c.networks[0] !== 'host' ? `net:${c.networks[0]}` : 'host';
      keep({ id: `ctr:${c.name}`, kind: 'ctr', label: c.name, r: nodeR(c), c, project: c.project }, near);
    }
    const byName = new Map(topo.containers.map(c => [c.name, c]));
    const list: L[] = [];
    for (const n of topo.networks) {
      if (n.name === 'host') continue;
      const members = topo.containers.filter(c => c.networks.includes(n.name));
      list.push({ id: `hub:${n.name}`, kind: 'hub', source: `net:${n.name}`, target: 'host', rx: members.reduce((a, c) => a + c.rx, 0), tx: members.reduce((a, c) => a + c.tx, 0) });
    }
    for (const c of topo.containers) {
      for (const n of c.networks) list.push({ id: `l:${c.name}:${n}`, kind: 'net', source: `ctr:${c.name}`, target: n === 'host' ? 'host' : `net:${n}`, rx: c.rx, tx: c.tx });
      if (c.via && byName.has(c.via)) list.push({ id: `via:${c.name}`, kind: 'via', source: `ctr:${c.name}`, target: `ctr:${c.via}`, rx: 0, tx: 0 });
    }
    const structural = prev.size !== next.size || links.current.length !== list.length;
    nodes.current = next;
    links.current = list;

    const all = [...next.values()];
    if (!sim.current) {
      sim.current = forceSimulation<N, L>()
        .force('charge', forceManyBody<N>().strength(d => (d.kind === 'net' ? -520 : d.kind === 'host' ? -900 : -240)))
        .force('collide', forceCollide<N>(d => d.r + 12))
        .force('x', forceX<N>(0).strength(0.035))
        .force('y', forceY<N>(0).strength(0.035))
        .on('tick', () => setFrame(f => (f + 1) % 1e6));
    }
    const s = sim.current;
    s.nodes(all);
    s.force(
      'link',
      forceLink<N, L>(list)
        .id(d => d.id)
        .distance(l => (l.kind === 'via' ? 58 : l.kind === 'hub' ? 150 : 78))
        .strength(l => (l.kind === 'via' ? 1 : l.kind === 'hub' ? 0.5 : 0.7)),
    );
    // Compose projects gather around their own centre.
    s.force('project', (alpha: number) => {
      const centre = new Map<string, { x: number; y: number; n: number }>();
      for (const n of all) {
        if (n.kind !== 'ctr' || !n.project) continue;
        const c = centre.get(n.project) ?? { x: 0, y: 0, n: 0 };
        c.x += n.x ?? 0;
        c.y += n.y ?? 0;
        c.n++;
        centre.set(n.project, c);
      }
      for (const n of all) {
        const c = n.project && centre.get(n.project);
        if (!c || c.n < 2 || n.kind !== 'ctr') continue;
        n.vx = (n.vx ?? 0) + (c.x / c.n - (n.x ?? 0)) * alpha * 0.08;
        n.vy = (n.vy ?? 0) + (c.y / c.n - (n.y ?? 0)) * alpha * 0.08;
      }
    });
    s.alpha(structural ? 0.9 : 0.05).restart();
    if (reducedMotion()) {
      s.stop();
      for (let i = 0; i < 300; i++) s.tick();
      setFrame(f => f + 1);
    }
  }, [topo]);

  useEffect(() => () => void sim.current?.stop(), []);

  // Fit everything in view once laid out.
  const fit = useCallback(() => {
    const all = [...nodes.current.values()];
    if (!all.length) return;
    const xs = all.map(n => n.x ?? 0);
    const ys = all.map(n => n.y ?? 0);
    const minX = Math.min(...xs) - 80;
    const maxX = Math.max(...xs) + 80;
    const minY = Math.min(...ys) - 80;
    const maxY = Math.max(...ys) + 80;
    const k = Math.min(1.4, Math.max(0.25, Math.min(size.w / (maxX - minX), size.h / (maxY - minY))));
    setView({ k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: size.h / 2 - ((minY + maxY) / 2) * k });
  }, [size]);
  useEffect(() => {
    if (!topo || fitted.current) return;
    const t = window.setTimeout(() => {
      fit();
      fitted.current = true;
    }, 1400);
    return () => window.clearTimeout(t);
  }, [topo, fit]);

  // Zoom (wheel) and pan (drag the ground).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView(v => {
        const k = Math.min(3, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const drag = useRef<{ mode: 'pan' | 'node'; id?: string; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const toWorld = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const id = (e.target as Element).closest<SVGElement>('[data-node]')?.dataset.node;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: id && id !== 'host' ? 'node' : 'pan', id, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.mode === 'pan') setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    else if (d.id) {
      const n = nodes.current.get(d.id);
      if (!n) return;
      const p = toWorld(e.clientX, e.clientY);
      n.fx = p.x;
      n.fy = p.y;
      sim.current?.alphaTarget(0.25).restart();
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'node' && d.id) {
      const n = nodes.current.get(d.id);
      if (n && d.moved) {
        n.fx = null;
        n.fy = null;
        sim.current?.alphaTarget(0);
      }
      if (!d.moved && d.id.startsWith('ctr:')) {
        setSelected(d.id);
        setConfirmRestart(false);
      }
    } else if (!d.moved) setSelected(null);
  };

  // Traffic particles on a canvas under the nodes.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    let colors = { rx: resolveColor('var(--color-accent-400)'), tx: resolveColor('var(--color-chart-7)') };
    const mo = new MutationObserver(() => (colors = { rx: resolveColor('var(--color-accent-400)'), tx: resolveColor('var(--color-chart-7)') }));
    mo.observe(document.documentElement, { attributes: true });
    if (reducedMotion()) return () => mo.disconnect();
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const v = viewRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
      for (const l of links.current) {
        if (l.kind === 'via') continue;
        const s = l.source as N;
        const e = l.target as N;
        if (s.x === undefined || e.x === undefined) continue;
        const dx = (e.x ?? 0) - (s.x ?? 0);
        const dy = (e.y ?? 0) - (s.y ?? 0);
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (const [bytes, dir, color] of [
          [l.rx, -1, colors.rx],
          [l.tx, 1, colors.tx],
        ] as [number, number, string][]) {
          if (bytes < 200) continue;
          const lg = Math.log10(bytes);
          const count = Math.min(9, Math.max(1, Math.round(lg - 1.5)));
          const speed = 0.06 + lg * 0.035; // links per second
          const radius = Math.min(3.2, 1.2 + lg * 0.3);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
          for (let i = 0; i < count; i++) {
            let f = ((t / 1000) * speed + i / count) % 1;
            if (dir < 0) f = 1 - f; // received: from the network to the container
            const off = dir * 2.5;
            ctx.beginPath();
            ctx.arc((s.x ?? 0) + dx * f + nx * off, (s.y ?? 0) + dy * f + ny * off, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [size]);

  const all = [...nodes.current.values()];
  const q = query.trim().toLowerCase();
  const neighbours = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    for (const l of links.current) {
      const s = (l.source as N).id ?? l.source;
      const t = (l.target as N).id ?? l.target;
      if (s === hover) set.add(t as string);
      if (t === hover) set.add(s as string);
    }
    return set;
  }, [hover, topo]);
  const dim = (id: string, label: string) => (neighbours ? !neighbours.has(id) : q ? !label.toLowerCase().includes(q) : false);

  // Compose zones.
  const zones = useMemo(() => {
    const groups = new Map<string, N[]>();
    for (const n of all) if (n.kind === 'ctr' && n.project) groups.set(n.project, [...(groups.get(n.project) ?? []), n]);
    return [...groups.entries()]
      .filter(([, ns]) => ns.length >= 2)
      .map(([project, ns]) => {
        const pts = hull(ns.map(n => [n.x ?? 0, n.y ?? 0] as [number, number]));
        const d = `M${pts.map(p => p.join(' ')).join(' L')} Z`;
        const top = ns.reduce((a, n) => ((n.y ?? 0) < (a.y ?? 0) ? n : a), ns[0]);
        return { project, d, x: top.x ?? 0, y: (top.y ?? 0) - top.r - 34, h: hue(project) };
      });
  });

  const sel = selected ? nodes.current.get(selected)?.c : undefined;
  const selTile = sel ? tileFor.get(sel.name) : undefined;
  const hoverNode = hover ? nodes.current.get(hover) : undefined;
  const totalRx = topo?.containers.filter(c => !c.via).reduce((a, c) => a + c.rx, 0) ?? 0;
  const totalTx = topo?.containers.filter(c => !c.via).reduce((a, c) => a + c.tx, 0) ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-3 lg:h-[calc(100dvh-3rem)]">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-title-2-semibold text-text-primary">Carte de l’infra</h1>
          <p className="text-body-2-regular text-text-tertiary">
            {topo ? `${topo.containers.length} conteneurs · ${topo.networks.length} réseaux · ↓ ${rate(totalRx)} · ↑ ${rate(totalTx)}` : 'Chargement…'}
          </p>
        </div>
        <label className="flex h-9 w-64 items-center gap-2 rounded-xl border border-border-button-default bg-background-secondary-default px-3">
          <RiSearchLine className="size-4 text-foreground-icon-tertiary" aria-hidden />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Trouver un conteneur…" className="min-w-0 flex-1 bg-transparent text-body-2-regular text-text-primary outline-none placeholder:text-text-placeholder" />
        </label>
      </header>

      <div
        ref={wrap}
        className="map-ground relative flex-1 touch-none overflow-hidden rounded-3xl border border-border-button-default"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg width={size.w} height={size.h} className="absolute inset-0 select-none">
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* Compose zones */}
            {zones.map(z => (
              <g key={z.project} className={cx('map-zone', q || neighbours ? 'opacity-40' : '')} style={{ '--zh': z.h } as React.CSSProperties}>
                <path d={z.d} />
                <text x={z.x} y={z.y} textAnchor="middle">
                  {z.project}
                </text>
              </g>
            ))}

            {/* Links */}
            {links.current.map(l => {
              const s = l.source as N;
              const t = l.target as N;
              if (s.x === undefined || t.x === undefined) return null;
              const faded = neighbours ? !(neighbours.has(s.id) && neighbours.has(t.id)) : false;
              return (
                <line
                  key={l.id}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  className={cx('map-link', `is-${l.kind}`, faded && 'is-faded', l.rx + l.tx > 50_000 && 'is-busy')}
                />
              );
            })}

            {/* Nodes */}
            {all.map(n => {
              const faded = dim(n.id, n.label);
              if (n.kind === 'host')
                return (
                  <g key={n.id} data-node={n.id} transform={`translate(${n.x},${n.y})`} className="map-host" onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
                    <circle r={n.r + 8} className="map-host-halo" />
                    <circle r={n.r} className="map-host-body" />
                    <foreignObject x={-12} y={-20} width={24} height={24}>
                      <RiServerLine className="size-6 text-white" aria-hidden />
                    </foreignObject>
                    <text y={16} textAnchor="middle" className="map-host-label">
                      {stats ? `${Math.round(stats.cpu.usage)} % · ${Math.round(stats.memory.usage)} %` : 'Serveur'}
                    </text>
                  </g>
                );
              if (n.kind === 'net') {
                const w = Math.max(60, n.label.length * 6.4 + 22);
                return (
                  <g key={n.id} data-node={n.id} transform={`translate(${n.x},${n.y})`} className={cx('map-net', faded && 'is-faded')} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
                    <rect x={-w / 2} y={-11} width={w} height={22} rx={11} />
                    <text textAnchor="middle" y={4}>
                      {n.label.replace(/_default$/, '')}
                    </text>
                  </g>
                );
              }
              const c = n.c!;
              const tile = tileFor.get(c.name);
              const serviceDown = tile?.status === 'offline';
              const stopped = c.state !== 'running';
              const update = data.updates.containers[c.name];
              const circ = 2 * Math.PI * (n.r + 4);
              return (
                <g
                  key={n.id}
                  data-node={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className={cx('map-ctr', faded && 'is-faded', stopped && 'is-stopped', (serviceDown || c.health === 'unhealthy') && 'is-down', selected === n.id && 'is-selected')}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                >
                  <circle r={n.r + 4} className="map-cpu-track" />
                  <circle r={n.r + 4} className="map-cpu" style={{ strokeDasharray: `${(Math.min(100, c.cpu) / 100) * circ} ${circ}` }} transform="rotate(-90)" />
                  <circle r={n.r} className="map-ctr-body" />
                  <foreignObject x={-12} y={-12} width={24} height={24} className="pointer-events-none">
                    {tile ? <LinkIcon service={tile} size={24} /> : <span className="map-initials">{c.name.slice(0, 2)}</span>}
                  </foreignObject>
                  {(update?.state === 'available' || update?.state === 'recreate') && <circle cx={n.r * 0.72} cy={-n.r * 0.72} r={4.5} className="map-update" />}
                  {(view.k > 0.55 || hover === n.id || selected === n.id) && (
                    <text y={n.r + 16} textAnchor="middle" className="map-label">
                      {c.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <canvas ref={canvas} className="pointer-events-none absolute inset-0" style={{ width: size.w, height: size.h }} />

        {/* Hover card */}
        {hoverNode?.c && !drag.current && (
          <div
            className="map-tip pointer-events-none absolute z-10 w-60 rounded-2xl border border-border-button-default bg-background-secondary-default p-3 shadow-dropdown"
            style={{ left: Math.min(size.w - 250, (hoverNode.x ?? 0) * view.k + view.x + hoverNode.r * view.k + 12), top: Math.max(8, (hoverNode.y ?? 0) * view.k + view.y - 40) }}
          >
            <p className="truncate text-body-semibold text-text-primary">{hoverNode.c.name}</p>
            <p className="truncate font-mono text-caption-1-regular text-text-tertiary">{hoverNode.c.image}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-caption-1-medium text-text-secondary tabular-nums">
              <span>CPU {hoverNode.c.cpu} %</span>
              <span>RAM {hoverNode.c.ram} %</span>
              <span className="text-accent-400">↓ {rate(hoverNode.c.rx)}</span>
              <span className="text-chart-7">↑ {rate(hoverNode.c.tx)}</span>
            </div>
            {hoverNode.c.via && <p className="mt-1.5 text-caption-1-regular text-text-tertiary">Passe par le réseau de {hoverNode.c.via}</p>}
            {hoverNode.c.ports.length > 0 && <p className="mt-1 truncate text-caption-1-regular text-text-tertiary">Ports {hoverNode.c.ports.map(p => p.public).join(', ')}</p>}
          </div>
        )}

        {/* Legend, zoom */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-background-secondary-default/80 px-3 py-2 text-caption-1-medium text-text-secondary backdrop-blur">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-accent-400" /> reçu</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-chart-7" /> envoyé</span>
          <span className="flex items-center gap-1.5"><i className="map-legend-tube" /> réseau partagé (VPN)</span>
          <span className="flex items-center gap-1.5"><i className="map-legend-zone" /> stack compose</span>
          <span className="hidden sm:inline">taille = RAM · anneau = CPU</span>
        </div>
        <div className="absolute right-3 bottom-3 flex flex-col gap-1" onPointerDown={e => e.stopPropagation()}>
          {[
            { icon: RiAddLine, label: 'Zoomer', run: () => setView(v => ({ ...v, k: Math.min(3, v.k * 1.25), x: size.w / 2 - ((size.w / 2 - v.x) / v.k) * Math.min(3, v.k * 1.25), y: size.h / 2 - ((size.h / 2 - v.y) / v.k) * Math.min(3, v.k * 1.25) })) },
            { icon: RiSubtractLine, label: 'Dézoomer', run: () => setView(v => ({ ...v, k: Math.max(0.2, v.k / 1.25), x: size.w / 2 - ((size.w / 2 - v.x) / v.k) * Math.max(0.2, v.k / 1.25), y: size.h / 2 - ((size.h / 2 - v.y) / v.k) * Math.max(0.2, v.k / 1.25) })) },
            { icon: RiFocus3Line, label: 'Tout voir', run: fit },
          ].map(b => (
            <button key={b.label} type="button" onClick={b.run} aria-label={b.label} title={b.label} className="grid size-9 cursor-pointer place-items-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-secondary shadow-sm hover:text-foreground-icon-primary">
              <b.icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>

        {/* Details */}
        {sel && (
          <aside className="animate-panel-in absolute top-3 right-3 bottom-3 z-20 flex w-[360px] max-w-[calc(100%-1.5rem)] flex-col gap-3 overflow-y-auto rounded-2xl border border-border-button-default bg-background-secondary-default p-4 shadow-waitlist" onPointerDown={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background-tertiary-default">{selTile ? <LinkIcon service={selTile} size={26} /> : <span className="map-initials">{sel.name.slice(0, 2)}</span>}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-headline-medium text-text-primary">{sel.name}</p>
                <p className="truncate font-mono text-caption-1-regular text-text-tertiary">{sel.image}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Fermer" className="grid size-7 cursor-pointer place-items-center rounded-lg text-foreground-icon-tertiary hover:bg-background-tertiary-default">
                <RiCloseLine className="size-4" aria-hidden />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-body-2-regular">
              {[
                ['État', `${sel.state}${sel.health ? ` · ${sel.health}` : ''}`],
                ['Stack', sel.project ?? '–'],
                ['CPU', `${sel.cpu} %`],
                ['RAM', `${sel.ram} %`],
                ['Reçu', rate(sel.rx)],
                ['Envoyé', rate(sel.tx)],
                ['Réseau', sel.via ? `celui de ${sel.via}` : sel.networks.join(', ') || '–'],
                ['Ports', sel.ports.map(p => `${p.public}→${p.private}`).join(', ') || '–'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-background-tertiary-default px-3 py-2">
                  <dt className="text-caption-1-medium text-text-tertiary">{k}</dt>
                  <dd className="truncate text-text-primary" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {selTile && (
                <Button size="small" variant="secondary" leadingIcon={RiExternalLinkLine} onClick={() => openService(selTile, true)}>
                  Ouvrir
                </Button>
              )}
              <Button
                size="small"
                variant={confirmRestart ? 'danger' : 'secondary'}
                leadingIcon={RiRestartLine}
                onClick={async () => {
                  if (!confirmRestart) return setConfirmRestart(true);
                  setConfirmRestart(false);
                  try {
                    await dockerApi.restartContainer(sel.name);
                    notify(`${sel.name} redémarré`, 'ok');
                    window.setTimeout(load, 2000);
                  } catch {
                    notify(`Impossible de redémarrer ${sel.name}`, 'err');
                  }
                }}
              >
                {confirmRestart ? 'Confirmer' : 'Redémarrer'}
              </Button>
            </div>
            <div className="min-h-0">
              <p className="mb-1.5 text-caption-1-medium tracking-[0.08em] text-text-tertiary uppercase">Journaux</p>
              <DockerLogViewer containerId={sel.name} maxHeight="320px" />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
