import { Link, useLocation } from 'react-router-dom';
import { RiFolderOpenLine, RiHome5Line, RiCloseLine, RiPulseLine, RiSearchLine, RiSettings4Line, RiSparkling2Line } from '@remixicon/react';
import { openWrapped } from '../Wrapped';
import { useDashboard } from '../../store';
import { useShell } from '../../lib/shell';
import { moveFolder, moveLink } from '../../lib/links';
import { nextFolderColor } from '../../theme/folders';
import { LinkTree } from '../LinkTree';
import { CloudTree } from '../CloudTree';
import { Kbd } from '../ui/badge';
import { cx } from '../../utils/cx';
import { armFlip } from '../../lib/motion';
import { ThemeToggle } from './ThemeToggle';
import { Pet } from '../Pet';
import { skinInfo } from '../../theme/skins';

/**
 * Quiet sidebar: no panel, it sits on the page ground and stays faded until
 * the pointer (or focus) comes to it.
 *
 * Top to bottom: the mark, the search (opens the palette), the folder tree
 * (categories on a hairline rail; the open one follows the page scroll and
 * shows its links on lit connectors), then admin and theme as small icons.
 */
export function Sidebar({
  mobile = false,
  onClose,
  onOpenSearch,
}: {
  /** Inside the mobile drawer: fully visible, with a close button. */
  mobile?: boolean;
  onClose?: () => void;
  onOpenSearch: () => void;
}) {
  const { data, reorderServices, reorderCategories, addCategory } = useDashboard();
  const { goToCategory, activeCategory, setHoveredLink, openQuickAdd } = useShell();
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <aside
      className={cx(
        'flex h-full w-[248px] shrink-0 flex-col gap-6 py-3 pr-2 pl-3',
        !mobile && 'opacity-60 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <div className="flex items-center justify-between">
        <Link
          to="/"
          viewTransition
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <Pet />
          <span className="text-body-semibold tracking-tight text-text-primary">Nexus</span>
        </Link>
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la navigation"
            className="grid size-8 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary hover:text-foreground-icon-primary"
          >
            <RiCloseLine className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {/* The one search */}
      <button
        type="button"
        onClick={() => {
          onClose?.();
          onOpenSearch();
        }}
        aria-label="Rechercher (Ctrl K)"
        className="-mx-1 flex h-8 cursor-pointer items-center justify-between rounded-lg px-1 text-body-regular text-text-tertiary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <span className="flex items-center gap-2">
          <RiSearchLine className="size-4" aria-hidden />
          Rechercher
        </span>
        <Kbd className="bg-transparent text-text-tertiary">Ctrl K</Kbd>
      </button>

      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none]">
        <LinkTree
          categories={data.categories}
          services={data.services}
          selected={isHome && activeCategory ? activeCategory : 'all'}
          onSelect={id => {
            onClose?.();
            goToCategory(id);
          }}
          onHoverLink={setHoveredLink}
          onAddLink={(folderId, url) => openQuickAdd({ folderId, url })}
          onMoveLink={(id, folderId, index) => {
            armFlip();
            reorderServices(moveLink(data.services, id, folderId, index)).catch(() => undefined);
          }}
          onMoveFolder={(id, index) => reorderCategories(moveFolder(data.categories, id, index)).catch(() => undefined)}
          onCreateFolder={async name => {
            const id = await addCategory({
              id: '',
              name,
              color: nextFolderColor(data.categories.map(c => c.color)),
              icon: 'lucide:folder',
              order: data.categories.length,
            }).catch(() => null);
            if (id) window.setTimeout(() => goToCategory(id), 50);
          }}
        />
        <CloudTree />
      </div>

      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            onClose?.();
            openWrapped();
          }}
          className="wrapped-link -ml-1 flex h-8 cursor-pointer items-center gap-2 rounded-lg px-1 text-body-regular text-text-tertiary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiSparkling2Line className="size-4" aria-hidden />
          Wrapped
        </button>
        <Link
          to="/fichiers"
          viewTransition
          onClick={onClose}
          aria-current={pathname.startsWith('/fichiers') ? 'page' : undefined}
          className={cx(
            '-ml-1 flex h-8 items-center gap-2 rounded-lg px-1 text-body-regular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            pathname.startsWith('/fichiers') ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary',
          )}
        >
          <RiFolderOpenLine className="size-4" aria-hidden />
          Fichiers
        </Link>
        <Link
          to="/maison"
          viewTransition
          onClick={onClose}
          aria-current={pathname.startsWith('/maison') ? 'page' : undefined}
          className={cx(
            '-ml-1 flex h-8 items-center gap-2 rounded-lg px-1 text-body-regular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            pathname.startsWith('/maison') ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary',
          )}
        >
          <RiHome5Line className="size-4" aria-hidden />
          Maison
        </Link>
        <Link
          to="/systeme"
          viewTransition
          onClick={onClose}
          aria-current={pathname.startsWith('/systeme') ? 'page' : undefined}
          className={cx(
            '-ml-1 flex h-8 items-center gap-2 rounded-lg px-1 text-body-regular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            pathname.startsWith('/systeme') ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary',
          )}
        >
          <RiPulseLine className="size-4" aria-hidden />
          Système
        </Link>
      <div className="flex items-center justify-between">
        <Link
          to="/admin"
          viewTransition
          onClick={onClose}
          aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
          className={cx(
            '-ml-1 flex h-8 items-center gap-2 rounded-lg px-1 text-body-regular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            pathname.startsWith('/admin') ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary',
          )}
        >
          <RiSettings4Line className="size-4" aria-hidden />
          Administration
        </Link>
        {!skinInfo(data.theme.skin).mode && <ThemeToggle collapsed />}
      </div>
      </div>
    </aside>
  );
}
