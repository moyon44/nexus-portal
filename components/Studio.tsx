import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RiCloseLine, RiDeleteBinLine, RiDiceLine, RiDownload2Line, RiFileCopyLine, RiPaletteLine } from '@remixicon/react';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { copyText } from '../lib/actions';
import { skinsApi } from '../api';
import { applyCustom, applyTheme } from '../theme/theme';
import { customSkinOf, setCustomSkins, type CustomSkinConfig, type FontKey } from '../theme/skins';
import { DEFAULT_CUSTOM, FONTS, PRESETS, decodeSkin, encodeSkin, randomConfig } from '../theme/customSkin';
import { Button } from './ui/button';
import { Switch } from './ui/form';
import { cx } from '../utils/cx';

/**
 * Studio de style: builds a style of your own with a few controls and shows
 * it live on the real home page (the panel docks on the right; below lg it
 * is a bottom sheet). Saved styles sit next to the built-in ones (Admin →
 * Thème, palette) and can be shared as a NEXUS-… code.
 *
 * Opened with openStudio() (palette, Admin); the draft is only applied to
 * <html> (applyCustom without persisting) until "Enregistrer".
 */

const EVENT = 'portail:studio';

/** Opens the Studio, on a saved style or on a fresh draft. */
export function openStudio(id?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } }));
}

type Opts<K extends string> = { key: K; label: string }[];

function Choice<K extends string>({ value, options, onChange, label }: { value: K; options: Opts<K>; onChange: (k: K) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cx(
            'cursor-pointer rounded-lg border px-2.5 py-1 text-caption-1-medium outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            value === o.key
              ? 'border-accent-400 bg-accent-500 text-white'
              : 'border-border-button-default text-text-secondary hover:border-border-button-hover hover:text-text-primary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-separator-border pt-4">
      <h3 className="text-caption-1-medium tracking-[0.08em] text-text-tertiary uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-2-medium text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-body-2-medium text-text-secondary">
        {label}
        <span className="text-text-tertiary tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

const COLORS: { key: keyof CustomSkinConfig; label: string }[] = [
  { key: 'bg', label: 'Fond' },
  { key: 'bg2', label: 'Fond 2' },
  { key: 'surface', label: 'Cartes' },
  { key: 'text', label: 'Texte' },
  { key: 'accent', label: 'Accent' },
  { key: 'border', label: 'Bordures' },
];

export const Studio: React.FC<{ onActive: (active: boolean) => void }> = ({ onActive }) => {
  const { data, updateTheme, refetch } = useDashboard();
  const { notify } = useShell();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('Mon style');
  const [draft, setDraft] = useState<CustomSkinConfig>(DEFAULT_CUSTOM);
  const [code, setCode] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CustomSkinConfig>(key: K, value: CustomSkinConfig[K]) => setDraft(d => ({ ...d, [key]: value }));

  // Opening: on the style asked for, else on the current Studio style, else a preset.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      const current = customSkinOf(id ? `custom:${id}` : data.theme.skin);
      setEditingId(current?.id ?? null);
      setName(current?.name ?? 'Mon style');
      setDraft(current?.config ?? PRESETS[0].config);
      setConfirmDelete(false);
      setCode('');
      setOpen(true);
      if (location.pathname !== '/') navigate('/', { viewTransition: true });
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, [data.theme.skin, location.pathname, navigate]);

  useEffect(() => {
    onActive(open);
    if (!open) return;
    document.documentElement.dataset.studio = '';
    return () => {
      delete document.documentElement.dataset.studio;
    };
  }, [open, onActive]);

  // Live preview on the real page.
  useEffect(() => {
    if (open) applyCustom(draft);
  }, [open, draft]);

  const close = useCallback(() => {
    setOpen(false);
    applyTheme(data.theme);
  }, [data.theme]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await skinsApi.save({ id: editingId ?? undefined, name: name.trim() || 'Mon style', config: draft });
      const list = [...data.customSkins.filter(k => k.id !== saved.id), { ...saved, config: draft }];
      setCustomSkins(list);
      const key = `custom:${saved.id}` as const;
      await updateTheme({ skin: key });
      applyTheme({ ...data.theme, skin: key });
      await refetch();
      setOpen(false);
      notify(`Style « ${saved.name} » enregistré et appliqué`, 'ok');
    } catch {
      notify('Impossible d’enregistrer le style', 'err');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId) return;
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await skinsApi.remove(editingId);
      const wasCurrent = data.theme.skin === `custom:${editingId}`;
      setCustomSkins(data.customSkins.filter(k => k.id !== editingId));
      if (wasCurrent) await updateTheme({ skin: 'default' });
      await refetch();
      setOpen(false);
      applyTheme({ ...data.theme, skin: wasCurrent ? 'default' : data.theme.skin });
      notify('Style supprimé', 'ok');
    } catch {
      notify('Suppression impossible', 'err');
    }
  };

  const importCode = () => {
    const got = decodeSkin(code);
    if (!got) return notify('Code de style invalide', 'err');
    setName(got.name);
    setDraft(got.config);
    setEditingId(null);
    setCode('');
    notify(`Style « ${got.name} » chargé · Enregistrer pour le garder`, 'ok');
  };

  if (!open) return null;

  const fonts = (Object.keys(FONTS) as FontKey[]).map(k => (
    <option key={k} value={k}>
      {FONTS[k].label}
    </option>
  ));
  const selectCls =
    'h-9 w-full cursor-pointer rounded-lg border border-border-button-default bg-background-primary-default px-2 text-body-2-regular text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring';

  return (
    <aside
      aria-label="Studio de style"
      className="studio-panel animate-panel-in fixed inset-x-2 bottom-2 z-[65] flex h-[58vh] flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-secondary-default shadow-waitlist lg:inset-x-auto lg:top-3 lg:right-3 lg:bottom-3 lg:h-auto lg:w-[340px]"
    >
      <header className="flex items-center gap-2 border-b border-separator-border px-4 py-3">
        <RiPaletteLine className="size-5 text-accent-400" aria-hidden />
        <h2 className="flex-1 text-headline-medium text-text-primary">Studio de style</h2>
        <button type="button" onClick={close} aria-label="Fermer sans enregistrer" className="grid size-8 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary hover:bg-background-tertiary-default">
          <RiCloseLine className="size-5" aria-hidden />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-2-medium text-text-secondary">Nom</span>
          <input
            value={name}
            maxLength={64}
            onChange={e => setName(e.target.value)}
            className="h-9 rounded-lg border border-border-button-default bg-background-primary-default px-3 text-body-regular text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-body-2-medium text-text-secondary">Point de départ</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setDraft(p.config);
                  if (!editingId && (name === 'Mon style' || PRESETS.some(x => x.name === name))) setName(p.name);
                }}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-button-default py-1 pr-2.5 pl-1.5 text-caption-1-medium text-text-secondary hover:border-border-button-hover hover:text-text-primary"
              >
                <span aria-hidden className="flex overflow-hidden rounded-[5px]">
                  {[p.config.bg, p.config.surface, p.config.accent].map((c, i) => (
                    <span key={i} className="block h-4 w-2" style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDraft(randomConfig())}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent-500 px-2.5 py-1 text-caption-1-medium text-white hover:bg-accent-600"
            >
              <RiDiceLine className="size-4" aria-hidden /> Surprends-moi
            </button>
          </div>
        </div>

        <Group title="Couleurs">
          <Choice
            label="Mode"
            value={draft.mode}
            onChange={v => set('mode', v)}
            options={[
              { key: 'dark', label: 'Sombre' },
              { key: 'light', label: 'Clair' },
            ]}
          />
          <div className="grid grid-cols-3 gap-2">
            {COLORS.map(c => (
              <label key={c.key} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-border-button-default p-2 hover:border-border-button-hover">
                <span className="relative block size-9 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: draft[c.key] as string }}>
                  <input type="color" value={draft[c.key] as string} onChange={e => set(c.key, e.target.value as never)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={c.label} />
                </span>
                <span className="text-caption-1-medium text-text-secondary">{c.label}</span>
              </label>
            ))}
          </div>
        </Group>

        <Group title="Formes">
          <Slider label="Arrondi" value={draft.radius} min={0} max={32} unit=" px" onChange={v => set('radius', v)} />
          <Slider label="Épaisseur des bordures" value={draft.borderWidth} min={0} max={4} unit=" px" onChange={v => set('borderWidth', v)} />
          <Row label="Ombres">
            <Choice
              label="Ombres"
              value={draft.shadow}
              onChange={v => set('shadow', v)}
              options={[
                { key: 'none', label: 'Aucune' },
                { key: 'soft', label: 'Douces' },
                { key: 'hard', label: 'Dures' },
                { key: 'glow', label: 'Néon' },
              ]}
            />
          </Row>
        </Group>

        <Group title="Typographie">
          <Row label="Texte">
            <select value={draft.font} onChange={e => set('font', e.target.value as FontKey)} className={selectCls} style={{ fontFamily: FONTS[draft.font].css }}>
              {fonts}
            </select>
          </Row>
          <Row label="Titres">
            <select value={draft.titleFont} onChange={e => set('titleFont', e.target.value as FontKey)} className={selectCls} style={{ fontFamily: FONTS[draft.titleFont].css }}>
              {fonts}
            </select>
          </Row>
          <Switch checked={draft.titleUpper} onChange={v => set('titleUpper', v)} label="Titres en majuscules" />
          <Slider label="Espacement des titres" value={draft.titleSpacing} min={-5} max={30} unit="" onChange={v => set('titleSpacing', v)} />
        </Group>

        <Group title="Fond">
          <Choice
            label="Fond"
            value={draft.ground}
            onChange={v => set('ground', v)}
            options={[
              { key: 'solid', label: 'Uni' },
              { key: 'gradient', label: 'Dégradé' },
              { key: 'dots', label: 'Points' },
              { key: 'grid', label: 'Grille' },
              { key: 'aurora', label: 'Aurore' },
              { key: 'noise', label: 'Halo granuleux' },
            ]}
          />
          <Switch checked={draft.grain} onChange={v => set('grain', v)} label="Grain" />
          <Switch checked={draft.vignette} onChange={v => set('vignette', v)} label="Vignette" />
          <Switch checked={draft.scanlines} onChange={v => set('scanlines', v)} label="Lignes de balayage" />
        </Group>

        <Group title="Tuiles">
          <Row label="Matière">
            <Choice
              label="Matière"
              value={draft.tile}
              onChange={v => set('tile', v)}
              options={[
                { key: 'flat', label: 'Pleine' },
                { key: 'glass', label: 'Verre' },
                { key: 'outline', label: 'Contour' },
                { key: 'puffy', label: 'Bombée' },
              ]}
            />
          </Row>
          <Row label="Au survol">
            <Choice
              label="Au survol"
              value={draft.hover}
              onChange={v => set('hover', v)}
              options={[
                { key: 'tilt', label: 'Incline' },
                { key: 'lift', label: 'Soulève' },
                { key: 'glow', label: 'Lueur' },
                { key: 'invert', label: 'Inverse' },
                { key: 'none', label: 'Rien' },
              ]}
            />
          </Row>
          <Row label="Logos">
            <Choice
              label="Logos"
              value={draft.logos}
              onChange={v => set('logos', v)}
              options={[
                { key: 'color', label: 'Couleur' },
                { key: 'mono', label: 'Gris' },
                { key: 'ink', label: 'Encre' },
              ]}
            />
          </Row>
        </Group>

        <Group title="Partager">
          <Button
            variant="secondary"
            size="small"
            leadingIcon={RiFileCopyLine}
            onClick={async () => notify((await copyText(encodeSkin(name.trim() || 'Mon style', draft))) ? 'Code du style copié' : 'Copie impossible', 'ok')}
          >
            Copier le code du style
          </Button>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && importCode()}
              placeholder="Coller un code NEXUS-…"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border-button-default bg-background-primary-default px-3 font-mono text-caption-1-regular text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            />
            <Button variant="secondary" size="small" leadingIcon={RiDownload2Line} onClick={importCode} disabled={!code.trim()}>
              Importer
            </Button>
          </div>
        </Group>
      </div>

      <footer className="flex items-center gap-2 border-t border-separator-border px-4 py-3">
        {editingId && (
          <Button variant={confirmDelete ? 'danger' : 'ghost'} size="small" iconOnly={!confirmDelete} leadingIcon={RiDeleteBinLine} onClick={remove} aria-label="Supprimer ce style">
            {confirmDelete ? 'Confirmer' : undefined}
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="small" onClick={close}>
          Annuler
        </Button>
        <Button size="small" onClick={save} disabled={saving}>
          {editingId ? 'Enregistrer' : 'Enregistrer et appliquer'}
        </Button>
      </footer>
    </aside>
  );
};
