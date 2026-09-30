import { useState, type DragEvent } from 'react';
import { integrationsApi } from '../api';
import { useShell } from './shell';

/**
 * Nextcloud and kDrive, as the sidebar tree (components/CloudTree.tsx) and
 * the Fichiers page (pages/Fichiers.tsx) use them: names, roots, sizes, and
 * sending files into a folder one after the other with their progress.
 */

export type Store = 'nextcloud' | 'kdrive';

export const STORES: Record<Store, { name: string; root: string }> = {
  nextcloud: { name: 'Nextcloud', root: '/' },
  kdrive: { name: 'kDrive', root: '1' },
};

/** kDrive's root only holds its spaces (Private, shared…): nothing can be added there. */
export const canWrite = (store: Store, open: string) => !(store === 'kdrive' && open === STORES.kdrive.root);
export const READ_ONLY_HINT = 'Ouvre un dossier (par exemple Private) : la racine du kDrive n’accepte ni fichier ni dossier.';

/** Cloudflare's limit per request, and the backend's. */
export const MAX_UPLOAD = 100 * 1024 * 1024;

export const fileSize = (n: number | null) => {
  if (n === null) return '';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = n ? Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024))) : 0;
  return `${(n / 1024 ** i).toLocaleString('fr-FR', { maximumFractionDigits: i > 1 ? 1 : 0 })} ${units[i]}`;
};

export const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

/**
 * `upload(files)` sends them into `target` (Nextcloud path or kDrive id) of
 * `store`; `sending` lists them with their progress; `onDone` runs after.
 * Too big a file is refused up front; a taken name gets « (2) ».
 */
export function useUploader(store: Store, target: string, folderName: string, onDone: () => void) {
  const { notify } = useShell();
  const [sending, setSending] = useState<{ name: string; pct: number }[]>([]);

  const upload = async (files: File[]) => {
    const ok = files.filter(f => f.size <= MAX_UPLOAD);
    const big = files.filter(f => f.size > MAX_UPLOAD);
    if (big.length) notify(`${big.map(f => f.name).join(', ')} : trop gros (100 Mo au maximum depuis le portail)`, 'err');
    if (!ok.length) return;
    setSending(ok.map(f => ({ name: f.name, pct: 0 })));
    let done = 0;
    for (const [i, file] of ok.entries()) {
      try {
        const r = await integrationsApi.uploadToStore(store, target, file, p => setSending(list => list.map((x, j) => (j === i ? { ...x, pct: p } : x))));
        done++;
        if (r?.name && r.name !== file.name) notify(`« ${file.name} » existait déjà : envoyé sous « ${r.name} »`, 'info');
      } catch (e) {
        notify(`${file.name} : ${e instanceof Error ? e.message : 'envoi impossible'}`, 'err');
      }
      setSending(list => list.map((x, j) => (j === i ? { ...x, pct: 1 } : x)));
    }
    setSending([]);
    if (done) notify(`${done} fichier${done > 1 ? 's' : ''} déposé${done > 1 ? 's' : ''} dans « ${folderName} »`, 'ok');
    onDone();
  };

  return { sending, upload };
}
