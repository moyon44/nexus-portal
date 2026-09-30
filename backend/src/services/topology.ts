import Docker from 'dockerode';
import { getOverview } from './containers.js';

/**
 * The infrastructure map (frontend pages/Map.tsx): every container with its
 * networks, the container whose network it borrows (network_mode:
 * container:<id>, e.g. a media stack behind a VPN container), its compose
 * project, published ports, and live CPU / RAM / traffic from the sampler.
 */
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface TopoContainer {
  name: string;
  image: string;
  state: string;
  health: string | null;
  project: string | null;
  networks: string[];
  /** Name of the container whose network namespace it shares. */
  via: string | null;
  ports: { public: number; private: number }[];
  cpu: number;
  ram: number;
  rx: number;
  tx: number;
}

export async function getTopology() {
  const list = await docker.listContainers({ all: true });
  const byId = new Map(list.map(c => [c.Id, c]));
  const live = new Map(getOverview().map(o => [o.name, o]));
  const name = (c: Docker.ContainerInfo) => (c.Names?.[0] ?? '').replace(/^\//, '');

  const containers: TopoContainer[] = list.map(c => {
    const mode = c.HostConfig?.NetworkMode ?? '';
    const parent = mode.startsWith('container:') ? byId.get(mode.slice(10)) : undefined;
    const o = live.get(name(c));
    const health = /\((healthy|unhealthy|health: starting)\)/.exec(c.Status)?.[1] ?? null;
    const seen = new Set<string>();
    return {
      name: name(c),
      image: c.Image,
      state: c.State,
      health,
      project: c.Labels?.['com.docker.compose.project'] ?? null,
      networks: parent ? [] : Object.keys(c.NetworkSettings?.Networks ?? {}).filter(n => n !== 'none'),
      via: parent ? name(parent) : null,
      ports: (c.Ports ?? [])
        .filter(p => p.PublicPort && !seen.has(`${p.PublicPort}`) && seen.add(`${p.PublicPort}`))
        .map(p => ({ public: p.PublicPort!, private: p.PrivatePort })),
      cpu: o?.cpu ?? 0,
      ram: o?.ram ?? 0,
      rx: o?.rx ?? 0,
      tx: o?.tx ?? 0,
    };
  });

  const networks = [...new Set(containers.flatMap(c => c.networks))].map(n => ({
    name: n,
    kind: n === 'host' ? 'host' : n === 'bridge' ? 'bridge' : 'custom',
    members: containers.filter(c => c.networks.includes(n)).length,
  }));

  return { at: Date.now(), containers, networks };
}
