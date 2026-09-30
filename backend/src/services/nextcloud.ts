import Docker from 'dockerode';

/**
 * Nextcloud maintenance from the portal (Ctrl K → "Nextcloud : …"): a few
 * `occ` commands run inside the Nextcloud container as www-data, through the
 * Docker socket. Only the actions below can be run, one at a time; the last
 * one's outcome shows in the tile's details (routes/integrations.ts).
 */

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export const NC_ACTIONS = {
  upgrade: { label: 'Terminer la mise à jour', cmd: ['php', 'occ', 'upgrade', '--no-interaction'] },
  cron: { label: 'Lancer les tâches de fond', cmd: ['php', '-f', '/var/www/html/cron.php'] },
  scan: { label: 'Rescanner les fichiers', cmd: ['php', 'occ', 'files:scan', '--all'] },
  apps: { label: 'Mettre à jour les apps', cmd: ['php', 'occ', 'app:update', '--all'] },
  indices: { label: 'Ajouter les index manquants', cmd: ['php', 'occ', 'db:add-missing-indices'] },
  'maintenance-on': { label: 'Activer le mode maintenance', cmd: ['php', 'occ', 'maintenance:mode', '--on'] },
  'maintenance-off': { label: 'Quitter le mode maintenance', cmd: ['php', 'occ', 'maintenance:mode', '--off'] },
} as const;

export type NcAction = keyof typeof NC_ACTIONS;

export interface NcActionState {
  action: NcAction;
  label: string;
  status: 'running' | 'done' | 'failed';
  /** Last lines of the output. */
  output: string;
  startedAt: number;
  endedAt?: number;
}

let last: NcActionState | null = null;

export const lastAction = () => last;

/** The running Nextcloud app container (image `nextcloud`, not its database). */
async function findContainer(): Promise<Docker.Container> {
  const list = await docker.listContainers();
  const c = list.find((x) => /^nextcloud(:|@|$)/.test(x.Image)) ?? list.find((x) => x.Names.includes('/nextcloud'));
  if (!c) throw new Error('Conteneur Nextcloud introuvable');
  return docker.getContainer(c.Id);
}

async function exec(cmd: readonly string[], timeoutMs: number): Promise<{ code: number; output: string }> {
  const container = await findContainer();
  const e = await container.exec({ Cmd: [...cmd], User: 'www-data', WorkingDir: '/var/www/html', AttachStdout: true, AttachStderr: true });
  const stream = await e.start({ hijack: true, stdin: false });
  let output = '';
  const sink = { write: (chunk: Buffer) => ((output += chunk.toString()), true) } as unknown as NodeJS.WritableStream;
  docker.modem.demuxStream(stream, sink, sink);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Délai dépassé')), timeoutMs);
    stream.on('end', () => (clearTimeout(t), resolve()));
    stream.on('error', (err) => (clearTimeout(t), reject(err)));
  });
  const { ExitCode } = await e.inspect();
  return { code: ExitCode ?? 0, output };
}

/** Starts an action in the background; refuses while another one runs. */
export function runAction(action: NcAction): NcActionState {
  if (last?.status === 'running') throw new Error(`Déjà en cours : ${last.label}`);
  const { label, cmd } = NC_ACTIONS[action];
  const state: NcActionState = { action, label, status: 'running', output: '', startedAt: Date.now() };
  last = state;
  exec(cmd, 30 * 60_000)
    .then(({ code, output }) => {
      state.status = code === 0 ? 'done' : 'failed';
      state.output = tail(output);
    })
    .catch((e) => {
      state.status = 'failed';
      state.output = String(e?.message ?? e);
    })
    .finally(() => (state.endedAt = Date.now()));
  return state;
}

const tail = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/cannot have an empty name/.test(l))
    .slice(-6)
    .join('\n');
