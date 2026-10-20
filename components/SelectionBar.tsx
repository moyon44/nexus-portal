import { useState } from 'react';
import { RiCheckboxMultipleLine, RiCloseLine, RiDeleteBinLine, RiFolderTransferLine, RiRestartLine, RiStarLine } from '@remixicon/react';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { containerOf, restartContainer } from '../lib/actions';
import { byOrder, linksIn } from '../lib/links';
import { armFlip } from '../lib/motion';
import { cx } from '../utils/cx';
import { DropdownMenu } from './ui/dropdown-menu';
import { folderTint } from '../theme/folders';

/**
 * Floating action bar for a multi-selection (bencho.dev "Selection list"):
 * move to a category, favourite, restart the containers, delete. Restart
 * asks for a second click; delete is undone from the Island.
 */
export function SelectionBar({ ids, onClear, onSelectAll }: { ids: string[]; onClear: () => void; onSelectAll: () => void }) {
  const { data, reorderServices, toggleFavorite, deleteService, restoreServices } = useDashboard();
  const { notify } = useShell();
  const [confirm, setConfirm] = useState<'restart' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = data.services.filter(s => ids.includes(s.id));
  const containers = selected.map(containerOf).filter((c): c is string => !!c);
  const allFav = selected.length > 0 && selected.every(s => s.isFavorite);
  const n = selected.length;
  const plural = n > 1 ? 's' : '';

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      notify(label, 'ok');
    } catch {
      notify('Action impossible sur une partie de la sélection', 'err');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const moveTo = (folderId: string) =>
    run(`${n} lien${plural} déplacé${plural}`, async () => {
      const kept = linksIn(data.services, folderId).filter(s => !ids.includes(s.id)).map(s => s.id);
      const order = [...kept, ...selected.sort(byOrder).map(s => s.id)];
      armFlip();
      await reorderServices(order.map((id, i) => ({ id, categoryId: folderId, order: i })));
    });

  const favorite = () =>
    run(allFav ? 'Retirés des favoris' : 'Ajoutés aux favoris', async () => {
      for (const s of selected) if (s.isFavorite === allFav) await toggleFavorite(s.id);
    });

  const restart = () => {
    if (confirm !== 'restart') return setConfirm('restart');
    run(`${containers.length} conteneur${containers.length > 1 ? 's' : ''} redémarré${containers.length > 1 ? 's' : ''}`, async () => {
      await Promise.all(containers.map(restartContainer));
    });
  };

  // One click: the Island offers to undo (all of them at once).
  const remove = async () => {
    const gone = [...ids];
    setBusy(true);
    try {
      for (const id of gone) await deleteService(id);
      onClear();
      notify(`${n} lien${plural} supprimé${plural}`, 'ok', {
        action: 'Annuler',
        onClick: () =>
          void restoreServices(gone)
            .then(() => notify(`${gone.length} lien${gone.length > 1 ? 's' : ''} restauré${gone.length > 1 ? 's' : ''}`, 'ok'))
            .catch(() => notify('Restauration impossible', 'err')),
      });
    } catch {
      notify('Action impossible sur une partie de la sélection', 'err');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const btn =
    'flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-body-2-medium text-white/85 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex justify-center px-3">
      <div
        role="toolbar"
        aria-label="Actions sur la sélection"
        className="selection-bar pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[24px] bg-[#0a0a0b] p-1.5 text-white shadow-[0_16px_40px_-10px_rgb(0_0_0/0.7),inset_0_0_0_1px_rgb(255_255_255/0.08)]"
      >
        <span className="flex h-8 shrink-0 items-center gap-2 pr-2 pl-3 text-body-2-semibold tabular-nums">
          <span className="grid size-5 place-items-center rounded-full bg-accent-500 text-caption-1-semibold">{n}</span>
          sélectionné{plural}
        </span>
        <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden />

        <DropdownMenu
          placement="top"
          title="Déplacer vers"
          disabled={busy}
          className="shrink-0"
          triggerClassName="h-8 rounded-full bg-transparent px-3 text-white/85 shadow-none backdrop-blur-none hover:bg-white/10 hover:text-white"
          options={[...data.categories].sort(byOrder).map(c => ({
            label: c.name,
            Icon: <span className="size-2.5 rounded-full" style={{ backgroundColor: folderTint(c.color) }} />,
            active: selected.length > 0 && selected.every(s => s.categoryId === c.id),
            onClick: () => moveTo(c.id),
          }))}
        >
          <RiFolderTransferLine className="size-4" aria-hidden />
          Déplacer
        </DropdownMenu>
        <button type="button" className={cx(btn, 'shrink-0')} onClick={favorite} disabled={busy}>
          <RiStarLine className="size-4" aria-hidden />
          {allFav ? 'Retirer des favoris' : 'Favoris'}
        </button>
        {containers.length > 0 && (
          <button type="button" className={cx(btn, 'shrink-0', confirm === 'restart' && 'bg-amber-500/20 text-amber-200')} onClick={restart} disabled={busy}>
            <RiRestartLine className="size-4" aria-hidden />
            {confirm === 'restart' ? `Confirmer (${containers.length})` : 'Redémarrer'}
          </button>
        )}
        <button type="button" className={cx(btn, 'shrink-0')} onClick={() => void remove()} disabled={busy}>
          <RiDeleteBinLine className="size-4" aria-hidden />
          Supprimer
        </button>
        <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden />
        <button type="button" className={cx(btn, 'shrink-0')} onClick={onSelectAll} title="Tout sélectionner">
          <RiCheckboxMultipleLine className="size-4" aria-hidden />
          Tout
        </button>
        <button type="button" className={cx(btn, 'shrink-0 px-2')} onClick={onClear} aria-label="Annuler la sélection (Échap)" title="Annuler (Échap)">
          <RiCloseLine className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
