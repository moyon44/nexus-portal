import Docker from 'dockerode';
import os from 'os';
import { audit } from './audit.js';

/**
 * Container updates and cleanup (what Watchtower and `docker system prune`
 * do), driven from the portal:
 *
 *  - check: for every image a container runs, ask the registry for the
 *    current digest (Engine API /distribution, the daemon handles auth) and
 *    compare it with the local image's RepoDigests. Also flags containers
 *    whose image was already pulled but which still run the old one.
 *    Images built locally (no RepoDigests) can't be updated from here.
 *  - update: pull, then recreate the container with the same settings:
 *    stop, rename the old one aside, create + start the new one, remove the
 *    old one (rollback if the new one fails to start). Anonymous volumes are
 *    carried over; containers sharing its network (network_mode:
 *    container:<id>, e.g. qBittorrent behind the VPN) are recreated after it.
 *    Updates run one at a time, a container's compose dependencies first
 *    (the database before the app); once a dependency is back, the queue
 *    waits for it to be ready, so an app never migrates against a database
 *    that's about to be stopped (Nextcloud 34 → 35, September 2026).
 *  - prune: stopped containers, unused images, unused networks, build
 *    cache, and optionally unused anonymous volumes.
 *
 * The portal's own containers (compose project "portail") are never touched:
 * the backend would kill itself mid-update.
 */

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const SELF_PROJECT = 'portail';
const CHECK_EVERY = 12 * 3600_000;

export type UpdateState = 'current' | 'available' | 'recreate' | 'local' | 'self' | 'error';

export interface ContainerUpdate {
  container: string;
  image: string;
  state: UpdateState;
  error?: string;
  /** Containers living in its network (network_mode: service:<it>), recreated with it. */
  dependents: string[];
}

export interface UpdateJob {
  container: string;
  status: 'queued' | 'pulling' | 'recreating' | 'done' | 'failed';
  step: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

let results = new Map<string, ContainerUpdate>();
let checkedAt = 0;
let checking: Promise<void> | null = null;
const jobs = new Map<string, UpdateJob>();
const pending: string[] = [];
let working = false;

const selfId = os.hostname();
const isSelf = (c: Docker.ContainerInfo) =>
  c.Labels?.['com.docker.compose.project'] === SELF_PROJECT || c.Id.startsWith(selfId);
const nameOf = (c: { Names?: string[]; Name?: string }) => (c.Names?.[0] ?? c.Name ?? '').replace(/^\//, '');

/** `nginx:alpine` → { repo: 'nginx', tag: 'alpine' }; digests-only refs have no tag. */
function splitRef(ref: string) {
  const at = ref.indexOf('@');
  if (at >= 0) return { repo: ref.slice(0, at), tag: null as string | null };
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  if (colon > slash) return { repo: ref.slice(0, colon), tag: ref.slice(colon + 1) };
  return { repo: ref, tag: 'latest' };
}

async function checkImage(ref: string): Promise<{ state: 'current' | 'available' | 'local' | 'error'; imageId?: string; error?: string }> {
  let local: Docker.ImageInspectInfo;
  try {
    local = await docker.getImage(ref).inspect();
  } catch (e: any) {
    return { state: 'error', error: 'image introuvable' };
  }
  if (!local.RepoDigests?.length) return { state: 'local', imageId: local.Id };
  try {
    const dist: any = await (docker.getImage(ref) as any).distribution();
    const remote: string | undefined = dist?.Descriptor?.digest;
    if (!remote) return { state: 'error', imageId: local.Id, error: 'registre sans réponse' };
    const same = local.RepoDigests.some(d => d.endsWith(`@${remote}`));
    return { state: same ? 'current' : 'available', imageId: local.Id };
  } catch (e: any) {
    const msg = String(e?.json?.message ?? e?.message ?? e).slice(0, 160);
    return { state: 'error', imageId: local.Id, error: /unauthorized|denied|toomanyrequests/i.test(msg) ? 'registre : accès refusé ou limite atteinte' : msg };
  }
}

async function runCheck() {
  const containers = await docker.listContainers({ all: true });
  const byImage = new Map<string, Awaited<ReturnType<typeof checkImage>>>();
  const next = new Map<string, ContainerUpdate>();
  const dependents = (c: Docker.ContainerInfo) =>
    containers.filter(o => o.HostConfig?.NetworkMode === `container:${c.Id}`).map(nameOf);
  for (const c of containers) {
    const name = nameOf(c);
    const ref = c.Image;
    if (isSelf(c)) {
      next.set(name, { container: name, image: ref, state: 'self', dependents: [] });
      continue;
    }
    if (/^sha256:/.test(ref)) {
      next.set(name, { container: name, image: ref, state: 'local', dependents: dependents(c) });
      continue;
    }
    if (!byImage.has(ref)) byImage.set(ref, await checkImage(ref));
    const r = byImage.get(ref)!;
    let state: UpdateState = r.state;
    // The newer image is already here but the container still runs the old one.
    if (state === 'current' && r.imageId && c.ImageID !== r.imageId) state = 'recreate';
    next.set(name, { container: name, image: ref, state, error: r.error, dependents: dependents(c) });
  }
  results = next;
  checkedAt = Date.now();
}

export function checkUpdates(force = false): Promise<void> {
  if (checking) return checking;
  if (!force && Date.now() - checkedAt < CHECK_EVERY) return Promise.resolve();
  checking = runCheck()
    .catch(e => console.error('update check:', e.message))
    .finally(() => {
      checking = null;
    });
  return checking;
}

export function getUpdates() {
  return {
    checkedAt: checkedAt || null,
    checking: !!checking,
    containers: Object.fromEntries(results),
    jobs: Object.fromEntries(jobs),
  };
}

export function startUpdateChecks() {
  setTimeout(() => void checkUpdates(), 60_000);
  setInterval(() => void checkUpdates(), 3600_000);
}

/* ----- Update --------------------------------------------------------------- */

function pull(ref: string): Promise<void> {
  const { repo, tag } = splitRef(ref);
  return new Promise((resolve, reject) => {
    docker.pull(tag ? `${repo}:${tag}` : ref, (err: any, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (e: any) => (e ? reject(e) : resolve()));
    });
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Create options for a new container with the settings of `info`. */
function recreateOptions(info: Docker.ContainerInspectInfo, oldImage: Docker.ImageInspectInfo | null, networkMode?: string) {
  const config: any = { ...info.Config };
  const image = oldImage?.Config as any;
  // Settings that only came from the old image go, so the new image's apply.
  if (image) {
    for (const k of ['Cmd', 'Entrypoint', 'WorkingDir', 'User', 'Healthcheck', 'ExposedPorts', 'Volumes', 'StopSignal', 'Shell', 'OnBuild'])
      if (same(config[k], image[k])) delete config[k];
    if (Array.isArray(config.Env) && Array.isArray(image.Env)) {
      const baked = new Set(image.Env as string[]);
      config.Env = (config.Env as string[]).filter(e => !baked.has(e));
    }
    if (config.Labels && image.Labels) {
      config.Labels = Object.fromEntries(Object.entries(config.Labels).filter(([k, v]) => image.Labels[k] !== v));
    }
  }
  // A hostname that is just the old container id would stick; let Docker pick.
  if (config.Hostname && info.Id.startsWith(config.Hostname)) delete config.Hostname;

  const host: any = { ...info.HostConfig };
  if (networkMode) host.NetworkMode = networkMode;
  const sharesNetwork = String(host.NetworkMode ?? '').startsWith('container:');
  if (sharesNetwork) {
    // Hostname and ports come from the container whose network it uses.
    delete config.Hostname;
    delete config.Domainname;
    delete config.ExposedPorts;
  }
  // Anonymous volumes: reuse them, or the data would stay behind.
  const binds = new Set<string>(host.Binds ?? []);
  const declared = new Set<string>([...(host.Mounts ?? []).map((m: any) => m.Target)]);
  for (const b of binds) declared.add(b.split(':')[1]);
  for (const m of info.Mounts ?? []) {
    if (m.Type === 'volume' && m.Name && !declared.has(m.Destination)) binds.add(`${m.Name}:${m.Destination}${m.RW ? '' : ':ro'}`);
  }
  host.Binds = [...binds];

  const endpoints: Record<string, any> = {};
  if (!sharesNetwork) {
    for (const [net, ep] of Object.entries(info.NetworkSettings.Networks ?? {})) {
      endpoints[net] = {
        IPAMConfig: ep.IPAMConfig ?? undefined,
        Links: ep.Links ?? undefined,
        Aliases: (ep.Aliases ?? []).filter((a: string) => !info.Id.startsWith(a)),
      };
    }
  }
  return {
    ...config,
    name: info.Name.replace(/^\//, ''),
    HostConfig: host,
    NetworkingConfig: { EndpointsConfig: endpoints },
  };
}

/** Recreates one container with its current image; returns the new id. */
async function recreate(name: string, job: UpdateJob, networkMode?: string): Promise<string> {
  const info = await docker.getContainer(name).inspect();
  // By id from here on: once renamed, the name belongs to the new container.
  const old = docker.getContainer(info.Id);
  const oldImage = await docker.getImage(info.Image).inspect().catch(() => null);
  const opts = recreateOptions(info, oldImage, networkMode);
  opts.Image = info.Config.Image;
  const wasRunning = info.State.Running;
  const aside = `${opts.name}-old-${Date.now().toString(36)}`;

  job.step = `Arrêt de ${opts.name}`;
  if (wasRunning) await old.stop({ t: 15 }).catch(() => undefined);
  await old.rename({ name: aside });
  let created: Docker.Container | null = null;
  try {
    job.step = `Création du nouveau ${opts.name}`;
    created = await docker.createContainer(opts);
    if (wasRunning) {
      job.step = `Démarrage de ${opts.name}`;
      await created.start();
    }
  } catch (e) {
    // Put the old one back.
    job.step = `Échec, retour à l’ancien ${opts.name}`;
    if (created) await created.remove({ force: true }).catch(() => undefined);
    await old.rename({ name: opts.name }).catch(() => undefined);
    if (wasRunning) await old.start().catch(() => undefined);
    throw e;
  }
  await old.remove({ force: true, v: false }).catch(() => undefined);
  const newInfo = await created.inspect();

  // Containers that ran inside its network now point at a dead id: recreate them on the new one.
  const all = await docker.listContainers({ all: true });
  for (const c of all) {
    const dep = await docker.getContainer(c.Id).inspect().catch(() => null);
    if (dep?.HostConfig.NetworkMode === `container:${info.Id}`) {
      job.step = `Rattachement de ${nameOf(c)} au nouveau réseau`;
      await recreate(nameOf(c), job, `container:${newInfo.Id}`);
    }
  }
  return newInfo.Id;
}

async function runUpdate(name: string) {
  const job = jobs.get(name)!;
  let updated = false;
  try {
    const info = await docker.getContainer(name).inspect();
    if (info.Config.Labels?.['com.docker.compose.project'] === SELF_PROJECT) throw new Error('Le portail ne peut pas se mettre à jour lui-même');
    const ref = info.Config.Image;
    job.status = 'pulling';
    job.step = `Téléchargement de ${ref}`;
    await pull(ref);
    const fresh = await docker.getImage(ref).inspect();
    job.status = 'recreating';
    if (fresh.Id === info.Image) {
      job.step = 'Déjà à jour';
    } else {
      updated = true;
      await recreate(name, job);
      await settle(name, job);
      job.step = 'Mis à jour';
    }
    job.status = 'done';
    if (updated) void audit({ action: 'UPDATE_IMAGE', entityType: 'DOCKER_CONTAINER', entityId: name, newValues: { ok: true } });
    const r = results.get(name);
    if (r) results.set(name, { ...r, state: 'current', error: undefined });
  } catch (e: any) {
    job.status = 'failed';
    job.error = String(e?.json?.message ?? e?.message ?? e).slice(0, 240);
    void audit({ action: 'UPDATE_IMAGE', entityType: 'DOCKER_CONTAINER', entityId: name, newValues: { ok: false, error: job.error } });
  } finally {
    job.endedAt = Date.now();
  }
}

/** Compose services a container depends on, as container names (same project). */
async function composeDeps(info: Docker.ContainerInspectInfo): Promise<string[]> {
  const labels = info.Config.Labels ?? {};
  const project = labels['com.docker.compose.project'];
  const services = (labels['com.docker.compose.depends_on'] ?? '')
    .split(',')
    .map((d) => d.split(':')[0])
    .filter(Boolean);
  if (!project || !services.length) return [];
  const all = await docker.listContainers({ all: true, filters: { label: [`com.docker.compose.project=${project}`] } });
  return all.filter((c) => services.includes(c.Labels['com.docker.compose.service'])).map(nameOf);
}

/** Next in line: the first queued container none of whose dependencies is still queued. */
async function pickNext(): Promise<string> {
  for (const name of pending) {
    const info = await docker.getContainer(name).inspect().catch(() => null);
    const deps = info ? await composeDeps(info) : [];
    if (!deps.some((d) => d !== name && pending.includes(d))) return name;
  }
  return pending[0];
}

/** After a dependency is recreated: healthy (when it has a healthcheck, ≤ 90 s) or 15 s to start up. */
async function settle(name: string, job: UpdateJob) {
  const others = await docker.listContainers({ all: true });
  const info = await docker.getContainer(name).inspect().catch(() => null);
  if (!info) return;
  const service = info.Config.Labels?.['com.docker.compose.service'];
  const project = info.Config.Labels?.['com.docker.compose.project'];
  const isDependency = others.some(
    (c) =>
      c.Labels?.['com.docker.compose.project'] === project &&
      (c.Labels?.['com.docker.compose.depends_on'] ?? '').split(',').some((d) => d.split(':')[0] === service),
  );
  if (!isDependency) return;
  job.step = `Attente que ${name} soit prêt`;
  if (!info.State.Health) {
    await new Promise((r) => setTimeout(r, 15_000));
    return;
  }
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const h = (await docker.getContainer(name).inspect().catch(() => null))?.State.Health?.Status;
    if (h === 'healthy') return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

async function work() {
  if (working) return;
  working = true;
  try {
    while (pending.length) {
      const name = await pickNext().catch(() => pending[0]);
      pending.splice(pending.indexOf(name), 1);
      await runUpdate(name);
    }
  } finally {
    working = false;
  }
}

/** Queues the update of one container (updates run one at a time, dependencies first). */
export function startUpdate(name: string): UpdateJob {
  const running = jobs.get(name);
  if (running && !running.endedAt) return running;
  const job: UpdateJob = { container: name, status: 'queued', step: 'En attente', startedAt: Date.now() };
  jobs.set(name, job);
  pending.push(name);
  // Let a burst of requests ("Tout mettre à jour") land before picking the order.
  setTimeout(() => void work(), 500);
  return job;
}

/* ----- Cleanup -------------------------------------------------------------- */

export interface PruneOptions {
  containers?: boolean;
  images?: 'dangling' | 'unused' | false;
  networks?: boolean;
  buildCache?: boolean;
  volumes?: boolean;
}

/** What each kind of cleanup would free, from `docker system df`. */
export async function prunePreview() {
  const df: any = await (docker as any).df();
  const containers = (df.Containers ?? []).filter((c: any) => c.State !== 'running' && !isSelf(c));
  const images = df.Images ?? [];
  const unused = images.filter((i: any) => i.Containers === 0);
  const dangling = unused.filter((i: any) => !i.RepoTags?.length || i.RepoTags.every((t: string) => t === '<none>:<none>'));
  const own = (i: any) => Math.max(0, i.Size - Math.max(0, i.SharedSize ?? 0));
  const volumes = (df.Volumes ?? []).filter((v: any) => v.UsageData?.RefCount === 0);
  const anonymous = volumes.filter((v: any) => v.Labels?.['com.docker.volume.anonymous'] !== undefined || /^[0-9a-f]{64}$/.test(v.Name));
  const cache = (df.BuildCache ?? []).filter((b: any) => !b.InUse);
  const networks = (await docker.listNetworks()).filter(n => !['bridge', 'host', 'none'].includes(n.Name));
  let unusedNetworks = 0;
  for (const n of networks) {
    const full: any = await docker.getNetwork(n.Id).inspect().catch(() => null);
    if (full && !Object.keys(full.Containers ?? {}).length) unusedNetworks++;
  }
  const sum = (list: any[], f: (x: any) => number) => list.reduce((a, x) => a + (f(x) || 0), 0);
  return {
    containers: { count: containers.length, bytes: sum(containers, c => c.SizeRw ?? 0), names: containers.map((c: any) => nameOf(c)) },
    dangling: { count: dangling.length, bytes: sum(dangling, own) },
    unused: { count: unused.length, bytes: sum(unused, own), names: unused.flatMap((i: any) => i.RepoTags ?? []).filter((t: string) => t !== '<none>:<none>').slice(0, 20) },
    networks: { count: unusedNetworks },
    buildCache: { count: cache.length, bytes: sum(cache, b => b.Size) },
    volumes: { count: anonymous.length, bytes: sum(anonymous, v => v.UsageData?.Size ?? 0), named: volumes.length - anonymous.length },
  };
}

export async function prune(o: PruneOptions) {
  const freed: Record<string, number> = {};
  const removed: Record<string, number> = {};
  if (o.containers) {
    // Never the portal's own stopped containers.
    const r: any = await docker.pruneContainers({ filters: { 'label!': [`com.docker.compose.project=${SELF_PROJECT}`] } });
    freed.containers = r.SpaceReclaimed ?? 0;
    removed.containers = r.ContainersDeleted?.length ?? 0;
  }
  if (o.images) {
    const r: any = await docker.pruneImages(o.images === 'unused' ? { filters: { dangling: ['false'] } } : {});
    freed.images = r.SpaceReclaimed ?? 0;
    removed.images = r.ImagesDeleted?.filter((d: any) => d.Deleted).length ?? 0;
  }
  if (o.networks) {
    const r: any = await docker.pruneNetworks();
    removed.networks = r.NetworksDeleted?.length ?? 0;
  }
  if (o.buildCache) {
    const r: any = await (docker as any).pruneBuilder();
    freed.buildCache = r.SpaceReclaimed ?? 0;
  }
  if (o.volumes) {
    // Anonymous volumes only (the daemon's default since API 1.42): named ones hold data.
    const r: any = await docker.pruneVolumes();
    freed.volumes = r.SpaceReclaimed ?? 0;
    removed.volumes = r.VolumesDeleted?.length ?? 0;
  }
  return { freed, removed, total: Object.values(freed).reduce((a, b) => a + b, 0) };
}
