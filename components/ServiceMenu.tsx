import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  RiChat3Line,
  RiCheckboxMultipleLine,
  RiDeleteBin6Line,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiInformationLine,
  RiQrCodeLine,
  RiRestartLine,
  RiStarFill,
  RiStarLine,
  RiTerminalBoxLine,
} from '@remixicon/react';
import type { Service } from '../types';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import {
  containerOf,
  copyText,
  openService,
  openSsh,
  restartContainer,
  sshTargetFor,
} from '../lib/actions';
import type { IconComponent } from './ui/button';
import { cx } from '../utils/cx';
import { canFlip, toggleFlipped } from '../lib/flip';

export type MenuAnchor = { service: Service; x: number; y: number };

type Item = {
  key: string;
  label: string;
  hint?: string;
  icon: IconComponent;
  danger?: boolean;
  run: () => void | Promise<void>;
  /** Asks for a second click before running. */
  confirm?: string;
};

/**
 * Right-click menu of a tile (or a sidebar link): the same actions as the
 * command palette, plus editing the link's comment (its description, shown
 * on the back of the card) and deleting it (one click, undone from the
 * Island or the history). Keyboard: arrows move, Enter runs, Escape closes.
 * Restarting a container asks for a second press.
 */
export function ServiceMenu({ anchor, onClose, onSelect }: { anchor: MenuAnchor | null; onClose: () => void; onSelect?: (id: string) => void }) {
  const { data, toggleFavorite, logAccess, updateService, deleteService, restoreServices } = useDashboard();
  const { notify, openDetails } = useShell();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Comment being edited, or null while the action list shows. */
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const service = anchor?.service ?? null;

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const margin = 8;
    setPos({
      left: Math.min(anchor.x, window.innerWidth - width - margin),
      top: anchor.y + height + margin > window.innerHeight ? Math.max(margin, anchor.y - height) : anchor.y,
    });
    setActive(0);
    setConfirming(null);
    setDraft(null);
    ref.current.focus();
  }, [anchor]);

  // The comment editor is taller than the list: keep it inside the window.
  useLayoutEffect(() => {
    if (!anchor || !ref.current || draft === null) return;
    const { height } = ref.current.getBoundingClientRect();
    const margin = 8;
    setPos(p => (p && p.top + height + margin > window.innerHeight ? { ...p, top: Math.max(margin, window.innerHeight - height - margin) } : p));
  }, [anchor, draft === null]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => onClose();
    // Escape closes even when focus is not inside the menu.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ref.current?.contains(document.activeElement)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [anchor, onClose]);

  if (!anchor || !service) return null;

  const container = containerOf(service);
  const ssh = sshTargetFor(service, data.theme.sshTarget);

  const items: Item[] = [
    {
      key: 'open',
      label: 'Ouvrir dans un nouvel onglet',
      icon: RiExternalLinkLine,
      run: () => {
        logAccess(service.id);
        openService(service, true);
      },
    },
    {
      key: 'copy',
      label: "Copier l'adresse",
      icon: RiFileCopyLine,
      run: async () => notify((await copyText(service.url)) ? 'Adresse copiée' : 'Copie impossible', 'ok'),
    },
    {
      key: 'fav',
      label: service.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      icon: service.isFavorite ? RiStarFill : RiStarLine,
      run: () => void toggleFavorite(service.id).catch(() => notify('Échec de la mise à jour', 'err')),
    },
    ...(ssh
      ? [
          {
            key: 'ssh',
            label: 'Ouvrir en SSH',
            hint: ssh,
            icon: RiTerminalBoxLine,
            run: async () => {
              await openSsh(ssh);
              notify(`Commande copiée : ssh ${ssh}`, 'ok');
            },
          },
        ]
      : []),
    ...(container
      ? [
          {
            key: 'restart',
            label: 'Redémarrer le conteneur',
            hint: container,
            icon: RiRestartLine,
            danger: true,
            confirm: `Confirmer le redémarrage de ${container}`,
            run: async () => {
              notify(`Redémarrage de ${container}…`, 'ok');
              try {
                await restartContainer(container);
                notify(`${container} redémarré`, 'ok');
              } catch {
                notify(`Impossible de redémarrer ${container}`, 'err');
              }
            },
          },
        ]
      : []),
    ...(onSelect
      ? [
          {
            key: 'select',
            label: 'Sélectionner',
            hint: 'Maj + clic',
            icon: RiCheckboxMultipleLine,
            run: () => onSelect(service.id),
          },
        ]
      : []),
    ...(canFlip(service.id)
      ? [
          {
            key: 'flip',
            label: 'Retourner la carte',
            hint: 'QR code, adresse, notes',
            icon: RiQrCodeLine,
            run: () => toggleFlipped(service.id),
          },
        ]
      : []),
    {
      key: 'details',
      label: 'Détails et journaux',
      icon: RiInformationLine,
      run: () => openDetails(service),
    },
    {
      key: 'comment',
      label: service.description ? 'Modifier le commentaire' : 'Ajouter un commentaire',
      icon: RiChat3Line,
      run: () => {},
    },
    {
      key: 'delete',
      label: 'Supprimer le lien',
      icon: RiDeleteBin6Line,
      danger: true,
      // One click: the Island offers to undo, and the history keeps it.
      run: async () => {
        try {
          await deleteService(service.id);
          notify(`${service.name} supprimé`, 'ok', {
            action: 'Annuler',
            onClick: () =>
              void restoreServices([service.id])
                .then(() => notify(`${service.name} restauré`, 'ok'))
                .catch(() => notify('Restauration impossible', 'err')),
          });
        } catch {
          notify('Suppression impossible', 'err');
        }
      },
    },
  ];

  const saveComment = async () => {
    if (draft === null || saving) return;
    const description = draft.trim();
    if (description === (service.description ?? '').trim()) return onClose();
    setSaving(true);
    try {
      await updateService({ ...service, description });
      notify(description ? 'Commentaire enregistré' : 'Commentaire retiré', 'ok');
      onClose();
    } catch {
      notify("Impossible d'enregistrer le commentaire", 'err');
    } finally {
      setSaving(false);
    }
  };

  const trigger = (item: Item) => {
    if (item.key === 'comment') {
      setDraft(service.description ?? '');
      return;
    }
    if (item.confirm && confirming !== item.key) {
      setConfirming(item.key);
      return;
    }
    onClose();
    void item.run();
  };

  return (
    <div className="fixed inset-0 z-[70]" onMouseDown={onClose} onContextMenu={e => (e.preventDefault(), onClose())}>
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-label={`Actions pour ${service.name}`}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => {
          if (draft !== null) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(i => (i + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(i => (i - 1 + items.length) % items.length);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            trigger(items[active]);
          }
        }}
        style={pos ? { left: pos.left, top: pos.top } : { left: anchor.x, top: anchor.y, visibility: 'hidden' }}
        className="animate-dialog-in absolute w-72 rounded-2xl border border-border-button-default bg-background-secondary-default p-1.5 shadow-dropdown outline-none"
      >
        <p className="truncate px-2.5 pt-1 pb-1.5 text-caption-1-medium text-text-tertiary">{service.name}</p>
        {draft !== null ? (
          <div className="flex flex-col gap-2 px-1 pb-1">
            <textarea
              autoFocus
              rows={4}
              maxLength={500}
              value={draft}
              placeholder="Identifiants par défaut, port, à quoi sert ce lien…"
              onChange={e => setDraft(e.target.value)}
              onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraft(null);
                  ref.current?.focus();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void saveComment();
                }
              }}
              className="w-full resize-none rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-2 text-body-regular text-text-primary outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-border-focus-ring"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption-1-regular text-text-tertiary">Ctrl + Entrée</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    ref.current?.focus();
                  }}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-body-regular text-text-secondary hover:bg-dropdown-item-hover-background"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveComment()}
                  className="cursor-pointer rounded-lg bg-dropdown-item-hover-background px-2.5 py-1 text-body-medium text-text-primary disabled:opacity-50"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        ) : (
        items.map((item, i) => {
          const Icon = item.icon;
          const isConfirming = confirming === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onMouseEnter={() => setActive(i)}
              onClick={() => trigger(item)}
              className={cx(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-body-regular outline-none',
                i === active && 'bg-dropdown-item-hover-background',
                isConfirming || item.danger ? 'text-text-error-primary' : 'text-text-primary',
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{isConfirming ? item.confirm : item.label}</span>
              {item.hint && !isConfirming && (
                <span className="max-w-28 shrink-0 truncate text-caption-1-regular text-text-tertiary">{item.hint}</span>
              )}
            </button>
          );
        })
        )}
      </div>
    </div>
  );
}
