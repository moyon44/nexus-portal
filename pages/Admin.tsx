import React, { useEffect, useState } from 'react';
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowLeftLine,
  RiArrowUpLine,
  RiDeleteBinLine,
  RiEditLine,
  RiExternalLinkLine,
  RiPaletteLine,
  RiPencilLine,
  RiSave3Line,
} from '@remixicon/react';
import { useDashboard } from '../store';
import { Service, Category, ThemeConfig } from '../types';
import { IconRenderer } from '../components/IconRenderer';
import { LinkIcon } from '../components/LinkIcon';
import { IntegrationsEditor } from '../components/admin/IntegrationsEditor';
import { NIGHT_FOCUS_KEY, nightFocusEnabled } from '../lib/shell';
import { ServiceCard } from '../components/ServiceCard';
import { DockerConfigSection } from '../components/admin/DockerConfigSection';
import { PageHeader, Panel, SectionLabel, EmptyState } from '../components/ui/panel';
import { Button } from '../components/ui/button';
import { Input, Select, Switch, Field } from '../components/ui/form';
import { SegmentedControl } from '../components/ui/segmented-control';
import { StatusDot } from '../components/ui/badge';
import { DEFAULT_ACCENT, DEFAULT_ACCENT_HEX, applyTheme } from '../theme/theme';
import { allSkins, skinInfo } from '../theme/skins';
import { openStudio } from '../components/Studio';
import { themeReveal } from '../lib/motion';
import { cursorEnabled, setCursorEnabled } from '../components/FancyCursor';
import { liteEnabled, setLite } from '../lib/lite';
import { FOLDER_SWATCHES, folderColor, folderHue, nextFolderColor } from '../theme/folders';
import { cx } from '../utils/cx';

// Simple UUID v4 generator
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const IconHint = () => (
  <span className="inline-flex items-center gap-1">
    Des milliers d'icônes sur
    <a
      href="https://icones.js.org/"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-button-ghost-foreground hover:underline"
    >
      icones.js.org <RiExternalLinkLine className="size-3" aria-hidden />
    </a>
    · le logo officiel (dashboard-icons) est pris d'office d'après le nom, ou forcé avec <code>di:nom</code>
  </span>
);

function IconPreview({ name }: { name?: string }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-2lg bg-stat-card-icon-background text-foreground-icon-primary shadow-card">
      <IconRenderer name={name || ''} size={20} />
    </span>
  );
}

// --- Sub-components for Admin ---

const ServiceEditor: React.FC<{
  service: Service | null,
  onSave: (s: Service) => Promise<void>,
  onCancel: () => void,
  categories: Category[]
}> = ({ service, onSave, onCancel, categories }) => {
  const { data } = useDashboard();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Service>(service || {
    id: generateUUID(),
    name: '',
    description: '',
    url: 'https://',
    categoryId: categories[0]?.id || '',
    tags: [],
    icon: 'lucide:box',
    status: 'online',
    openInNewTab: true,
    isVisible: true,
    isFavorite: false,
    order: 0,
    stats: {}
  });

  const handleChange = (field: keyof Service, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title={service ? 'Modifier le service' : 'Nouveau service'}
        action={<Button variant="plain" size="small" leadingIcon={RiArrowLeftLine} onClick={onCancel}>Retour</Button>}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Nom" value={form.name} onChange={e => handleChange('name', e.target.value)} />
          <Input label="Adresse" value={form.url} onChange={e => handleChange('url', e.target.value)} />
        </div>

        <Input label="Description" value={form.description || ''} onChange={e => handleChange('description', e.target.value)} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select label="Catégorie" value={form.categoryId} onChange={e => handleChange('categoryId', e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Field label="Icône (Iconify)" hint={<IconHint />}>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Code de l'icône"
                placeholder="lucide:home, tabler:alien, mdi:server"
                value={form.icon}
                onChange={e => handleChange('icon', e.target.value)}
                className="flex-1"
              />
              <IconPreview name={form.icon} />
            </div>
          </Field>
        </div>

        <Input
          label="Étiquettes"
          hint="Séparées par des virgules"
          value={form.tags.join(', ')}
          onChange={e => handleChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
        />

        <div className="flex flex-col gap-3 rounded-2xl bg-background-primary-default p-4 shadow-card">
          <Switch checked={form.openInNewTab} onChange={v => handleChange('openInNewTab', v)} label="Ouvrir dans un nouvel onglet" />
          <Switch checked={form.isVisible} onChange={v => handleChange('isVisible', v)} label="Visible sur l'accueil" />
        </div>

        <DockerConfigSection
          service={form}
          onUpdate={async (updatedService) => {
            setForm(updatedService);
          }}
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button leadingIcon={RiSave3Line} onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <SectionLabel>Aperçu</SectionLabel>
        <div className="sticky top-3 flex justify-center">
          <ServiceCard service={form} theme={data.theme} listView />
        </div>
      </div>
    </div>
  );
};

const CategoryEditor: React.FC<{
  category: Category | null,
  onSave: (c: Category) => Promise<void>,
  onCancel: () => void,
}> = ({ category, onSave, onCancel }) => {
  const { data } = useDashboard();
  const [form, setForm] = useState<Category>(category || {
    id: generateUUID(),
    name: 'Nouvelle catégorie',
    color: nextFolderColor(data.categories.map(c => c.color)),
    icon: 'lucide:folder',
    order: 0,
  });

  const handleChange = (field: keyof Category, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        action={<Button variant="plain" size="small" leadingIcon={RiArrowLeftLine} onClick={onCancel}>Retour</Button>}
      >
        <Input
          label="Nom"
          value={form.name}
          onChange={e => handleChange('name', e.target.value)}
          placeholder="Développement, Sécurité, Média…"
        />

        <Field label="Icône (Iconify)" hint={<IconHint />}>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Code de l'icône"
              placeholder="lucide:folder, tabler:code, mdi:shield"
              value={form.icon}
              onChange={e => handleChange('icon', e.target.value)}
              className="flex-1"
            />
            <IconPreview name={form.icon} />
          </div>
        </Field>

        <Field label="Couleur">
          <div role="radiogroup" aria-label="Couleur" className="flex flex-wrap gap-2">
            {FOLDER_SWATCHES.map(({ value, hue, className }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={folderHue(form.color) === hue}
                aria-label={hue}
                onClick={() => handleChange('color', value)}
                className={cx(
                  'grid size-8 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                  folderHue(form.color) === hue && 'ring-2 ring-border-focus-ring ring-offset-2 ring-offset-background-secondary-default',
                )}
              >
                <span className={cx('size-6 rounded-full', className)} />
              </button>
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button leadingIcon={RiSave3Line} onClick={() => onSave(form)} disabled={!form.name.trim()}>
            Enregistrer
          </Button>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <SectionLabel>Aperçu</SectionLabel>
        <div className="sticky top-3 flex items-center gap-3 rounded-3xl border border-border-button-default bg-background-secondary-default p-4">
          <IconPreview name={form.icon} />
          <span className="text-body-medium text-text-primary">{form.name}</span>
          <span className="ml-auto size-2.5 rounded-full" style={{ backgroundColor: folderColor(form.color) }} />
        </div>
      </div>
    </div>
  );
};

const ACCENT_PRESETS: { value: string; label: string; hex: string }[] = [
  { value: DEFAULT_ACCENT, label: 'Bleu (défaut)', hex: DEFAULT_ACCENT_HEX },
  { value: '#6366f1', label: 'Indigo', hex: '#6366f1' },
  { value: '#8b5cf6', label: 'Violet', hex: '#8b5cf6' },
  { value: '#ec4899', label: 'Rose', hex: '#ec4899' },
  { value: '#f97316', label: 'Orange', hex: '#f97316' },
  { value: '#10b981', label: 'Émeraude', hex: '#10b981' },
  { value: '#14b8a6', label: 'Sarcelle', hex: '#14b8a6' },
  { value: '#51617b', label: 'Ardoise', hex: '#51617b' },
];

/** Per-device: this browser shows only the favourites between 23 h and 6 h. */
const NightFocusSwitch: React.FC = () => {
    const [on, setOn] = useState(nightFocusEnabled);
    return (
        <Switch
            checked={on}
            onChange={v => {
                setOn(v);
                try {
                    window.localStorage.setItem(NIGHT_FOCUS_KEY, v ? 'on' : 'off');
                } catch {
                    // Storage blocked: the setting lasts for this page only.
                }
            }}
            label="Mode nuit : favoris seuls de 23 h à 6 h (cet appareil)"
        />
    );
};

/** Per-device: lite mode (lib/lite.ts). */
const LiteSwitch: React.FC = () => {
    const [on, setOn] = useState(liteEnabled);
    return (
        <Switch
            checked={on}
            onChange={v => {
                setOn(v);
                setLite(v);
            }}
            label="Mode léger : fond fixe, sans flou ni animations en boucle, pour les machines modestes (cet appareil)"
        />
    );
};

/** Per-device: animated cursor (ring, magnetic buttons, trail). */
const CursorSwitch: React.FC = () => {
    const [on, setOn] = useState(cursorEnabled);
    return (
        <Switch
            checked={on}
            onChange={v => {
                setOn(v);
                setCursorEnabled(v);
            }}
            label="Curseur animé : anneau, boutons aimantés, traînée (cet appareil, souris uniquement)"
        />
    );
};

/** Text setting saved on blur or Enter, not on every keystroke. */
const SavedInput: React.FC<{ label: string; hint?: string; value: string; placeholder?: string; onSave: (v: string) => void }> = ({
    label,
    hint,
    value,
    placeholder,
    onSave,
}) => {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => draft.trim() !== value && onSave(draft.trim());
    return (
        <Input
            label={label}
            hint={hint}
            value={draft}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => e.key === 'Enter' && commit()}
        />
    );
};

const ThemeEditor: React.FC = () => {
    const { data, updateTheme } = useDashboard();
    const { theme } = data;
    const isPreset = ACCENT_PRESETS.some(p => p.value === theme.primaryColor);

    return (
        <div className="grid max-w-5xl grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Apparence" subtitle="Mode d'affichage et couleur d'accent des boutons, onglets et sélections.">
                <Field label="Style" hint={skinInfo(theme.skin).hint}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Style">
                        {allSkins(data.customSkins).map(k => {
                            const active = (theme.skin ?? 'default') === k.key;
                            const customId = k.key.startsWith('custom:') ? k.key.slice(7) : null;
                            return (
                                <div key={k.key} className="group/skin relative">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={e =>
                                        themeReveal(e.clientX, e.clientY, () => {
                                            applyTheme({ ...theme, skin: k.key });
                                            void updateTheme({ skin: k.key });
                                        })
                                    }
                                    className={cx(
                                        'flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                                        active ? 'border-accent-400 bg-background-tertiary-default' : 'border-border-button-default hover:border-border-button-hover',
                                    )}
                                >
                                    <span aria-hidden className="relative block h-10 overflow-hidden rounded-lg" style={{ background: k.swatch[0] }}>
                                        <span className="absolute top-2 left-2 h-2.5 w-10 rounded-sm" style={{ background: k.swatch[1], boxShadow: `0 0 0 1px ${k.swatch[2]}55` }} />
                                        <span className="absolute top-6 left-2 h-2.5 w-7 rounded-sm" style={{ background: k.swatch[1], boxShadow: `0 0 0 1px ${k.swatch[2]}55` }} />
                                        <span className="absolute right-2 bottom-2 size-3 rounded-full" style={{ background: k.swatch[2] }} />
                                    </span>
                                    <span className="truncate px-0.5 text-caption-1-medium text-text-primary">{k.label}</span>
                                </button>
                                {customId && (
                                    <button
                                        type="button"
                                        onClick={() => openStudio(customId)}
                                        aria-label={`Modifier le style ${k.label}`}
                                        title="Modifier dans le Studio"
                                        className="absolute top-2.5 right-2.5 grid size-6 cursor-pointer place-items-center rounded-md bg-background-secondary-default/90 text-foreground-icon-secondary opacity-0 shadow-sm group-hover/skin:opacity-100 hover:text-foreground-icon-primary focus-visible:opacity-100"
                                    >
                                        <RiPencilLine className="size-3.5" aria-hidden />
                                    </button>
                                )}
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => openStudio()}
                            className="flex min-h-[74px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-button-hover p-1.5 text-caption-1-medium text-text-secondary outline-none hover:border-accent-400 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                        >
                            <RiPaletteLine className="size-5" aria-hidden />
                            Créer dans le Studio
                        </button>
                    </div>
                </Field>

                <Field label="Mode">
                    <SegmentedControl<ThemeConfig['mode']>
                        label="Mode"
                        value={theme.mode}
                        onChange={m => updateTheme({ mode: m })}
                        options={[
                            { key: 'light', label: 'Clair' },
                            { key: 'dark', label: 'Sombre' },
                            { key: 'auto', label: 'Système' },
                        ]}
                    />
                </Field>

                <Field label="Couleur d'accent">
                    <div className="flex flex-wrap items-center gap-2">
                        {ACCENT_PRESETS.map(p => (
                            <button
                                key={p.value}
                                type="button"
                                title={p.label}
                                aria-label={p.label}
                                aria-pressed={theme.primaryColor === p.value}
                                onClick={() => updateTheme({ primaryColor: p.value })}
                                className={cx(
                                    'grid size-8 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                                    theme.primaryColor === p.value && 'ring-2 ring-border-focus-ring ring-offset-2 ring-offset-background-secondary-default',
                                )}
                            >
                                <span className="size-6 rounded-full" style={{ background: p.hex }} />
                            </button>
                        ))}
                        <label
                            title="Couleur personnalisée"
                            className={cx(
                                'relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-border-button-hover',
                                !isPreset && 'ring-2 ring-border-focus-ring ring-offset-2 ring-offset-background-secondary-default',
                            )}
                        >
                            <RiAddLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                            <input
                                type="color"
                                aria-label="Couleur personnalisée"
                                value={/^#[0-9a-f]{6}$/i.test(theme.primaryColor) ? theme.primaryColor : DEFAULT_ACCENT_HEX}
                                onChange={(e) => updateTheme({ primaryColor: e.target.value })}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                        </label>
                    </div>
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                    <Button size="small">Aperçu principal</Button>
                    <Button size="small" variant="ghost">Secondaire</Button>
                    <Button size="small" variant="secondary">Neutre</Button>
                </div>
            </Panel>

            <Panel title="Fond de l'accueil" subtitle="Affiché derrière la page d'accueil, atténué pour garder la lisibilité.">
                <Field label="Type">
                    <SegmentedControl<ThemeConfig['backgroundType']>
                        label="Type de fond"
                        value={theme.backgroundType}
                        onChange={t => updateTheme({ backgroundType: t })}
                        options={[
                            { key: 'solid', label: 'Uni' },
                            { key: 'gradient', label: 'Dégradé' },
                            { key: 'image', label: 'Image' },
                        ]}
                    />
                </Field>
                {theme.backgroundType === 'solid' ? (
                    <p className="text-body-2-regular text-text-tertiary">
                        Le fond uni suit le thème clair ou sombre du design system.
                    </p>
                ) : (
                    <Input
                        label={theme.backgroundType === 'image' ? "Adresse de l'image" : 'Dégradé CSS'}
                        hint={theme.backgroundType === 'image' ? "Collez l'URL directe d'une image (Unsplash…)" : undefined}
                        value={theme.backgroundValue}
                        onChange={(e) => updateTheme({ backgroundValue: e.target.value })}
                        placeholder={theme.backgroundType === 'image' ? 'https://example.com/image.jpg' : 'linear-gradient(to right, #000, #fff)'}
                    />
                )}
            </Panel>

            <Panel title="Mise en page" subtitle="Densité de la grille et widgets affichés sur l'accueil.">
                <Field label="Densité">
                    <SegmentedControl<ThemeConfig['density']>
                        label="Densité"
                        value={theme.density}
                        onChange={d => updateTheme({ density: d })}
                        options={[
                            { key: 'compact', label: 'Compacte' },
                            { key: 'normal', label: 'Normale' },
                            { key: 'spacious', label: 'Aérée' },
                        ]}
                    />
                </Field>
                <div className="flex flex-col gap-3 rounded-2xl bg-background-primary-default p-4 shadow-card">
                    <Switch checked={theme.showClock} onChange={v => updateTheme({ showClock: v })} label="Horloge" />
                    <Switch checked={theme.showSystemStats !== false} onChange={v => updateTheme({ showSystemStats: v })} label="Statistiques du serveur" />
                    <Switch checked={theme.showWeather} onChange={v => updateTheme({ showWeather: v })} label="Météo" />
                    <Switch checked={theme.showDescriptions} onChange={v => updateTheme({ showDescriptions: v })} label="Descriptions des services" />
                    <NightFocusSwitch />
                    <CursorSwitch />
                    <LiteSwitch />
                </div>
            </Panel>

            <Panel title="Accueil" subtitle="Salutation de la barre de statut et cible des actions SSH.">
                <SavedInput
                    label="Prénom"
                    value={theme.userName || ''}
                    placeholder="Alex"
                    onSave={v => updateTheme({ userName: v })}
                />
                <SavedInput
                    label="Cible SSH"
                    hint="utilisateur@hôte du serveur, pour « Ouvrir en SSH » (clic droit sur une tuile, palette Ctrl K). Les services en adresse IP locale utilisent leur propre hôte."
                    value={theme.sshTarget || ''}
                    placeholder="root@192.168.1.10"
                    onSave={v => updateTheme({ sshTarget: v })}
                />
            </Panel>

            {theme.showWeather && (
                <Panel title="Météo" subtitle="Ville et unité du widget météo.">
                    <Input
                        label="Ville"
                        value={theme.weatherCity || 'Paris'}
                        onChange={e => updateTheme({ weatherCity: e.target.value })}
                        placeholder="Paris, Lyon, Nantes…"
                    />
                    <Field label="Unité">
                        <SegmentedControl<'metric' | 'imperial'>
                            label="Unité de température"
                            value={theme.weatherUnit || 'metric'}
                            onChange={u => updateTheme({ weatherUnit: u })}
                            options={[
                                { key: 'metric', label: '°C' },
                                { key: 'imperial', label: '°F' },
                            ]}
                        />
                    </Field>
                </Panel>
            )}
        </div>
    )
}

// --- Main Admin Component ---

type Tab = 'services' | 'categories' | 'integrations' | 'theme';

export const Admin: React.FC = () => {
  const { data, updateService, addService, deleteService, setServices, addCategory, deleteCategory, updateCategory } = useDashboard();
  const [activeTab, setActiveTab] = useState<Tab>('services');
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const sortedServices = [...data.services].sort((a, b) => a.order - b.order);

  // Sorting Helpers
  const moveService = async (index: number, direction: 'up' | 'down') => {
    const newServices = [...sortedServices];
    if (direction === 'up' && index > 0) {
      [newServices[index], newServices[index - 1]] = [newServices[index - 1], newServices[index]];
    } else if (direction === 'down' && index < newServices.length - 1) {
      [newServices[index], newServices[index + 1]] = [newServices[index + 1], newServices[index]];
    }
    newServices.forEach((s, i) => s.order = i);
    await setServices(newServices);
  };

  const editing = isCreatingCategory || editingCategory || isCreatingService || editingService;

  const renderContent = () => {
    if (isCreatingCategory || editingCategory) {
      return (
        <CategoryEditor
          category={editingCategory}
          onCancel={() => { setEditingCategory(null); setIsCreatingCategory(false); }}
          onSave={async (c) => {
             if (isCreatingCategory) await addCategory(c);
             else await updateCategory(c);
             setEditingCategory(null);
             setIsCreatingCategory(false);
          }}
        />
      );
    }

    if (isCreatingService || editingService) {
      return (
        <ServiceEditor
          service={editingService}
          categories={data.categories}
          onCancel={() => { setEditingService(null); setIsCreatingService(false); }}
          onSave={async (s) => {
             if (isCreatingService) await addService(s);
             else await updateService(s);
             setEditingService(null);
             setIsCreatingService(false);
          }}
        />
      );
    }

    switch (activeTab) {
      case 'services':
        return (
          <Panel
            title="Services"
            subtitle={`${data.services.length} service${data.services.length > 1 ? 's' : ''} · l'ordre est celui de l'accueil`}
            action={<Button leadingIcon={RiAddLine} onClick={() => setIsCreatingService(true)}>Ajouter un service</Button>}
            className="p-0 pt-5 [&>div:first-child]:px-5"
          >
            {sortedServices.length === 0 ? (
              <EmptyState>Aucun service pour l'instant.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="bui-table">
                  <thead>
                    <tr>
                      <th className="w-20 pl-5">Ordre</th>
                      <th className="w-full">Service</th>
                      <th>Catégorie</th>
                      <th>Statut</th>
                      <th className="pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedServices.map((service, index) => (
                      <tr key={service.id} className="last:border-b-0">
                        <td className="pl-5">
                          <div className="flex gap-0.5">
                            <Button variant="plain" size="xs" iconOnly leadingIcon={RiArrowUpLine} aria-label={`Monter ${service.name}`} onClick={() => moveService(index, 'up')} disabled={index === 0} />
                            <Button variant="plain" size="xs" iconOnly leadingIcon={RiArrowDownLine} aria-label={`Descendre ${service.name}`} onClick={() => moveService(index, 'down')} disabled={index === sortedServices.length - 1} />
                          </div>
                        </td>
                        <td>
                          <div className="flex min-w-48 items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-2lg bg-stat-card-icon-background text-foreground-icon-primary shadow-card">
                              <LinkIcon service={service} size={22} />
                            </span>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-body-medium text-text-primary">{service.name}</span>
                              <span className="truncate text-body-2-regular text-text-tertiary">{service.url}</span>
                            </div>
                            {!service.isVisible && <span className="text-body-2-regular text-text-tertiary">(masqué)</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-text-secondary">
                          {data.categories.find(c => c.id === service.categoryId)?.name || 'Sans catégorie'}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5 whitespace-nowrap text-body-2-regular text-text-secondary">
                            <StatusDot color={service.status === 'online' ? 'green' : service.status === 'offline' ? 'red' : 'yellow'} />
                            {service.status === 'online' ? 'En ligne' : service.status === 'offline' ? 'Hors ligne' : 'Inconnu'}
                          </span>
                        </td>
                        <td className="pr-5">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="plain" size="small" iconOnly leadingIcon={RiEditLine} aria-label={`Modifier ${service.name}`} onClick={() => setEditingService(service)} />
                            <Button
                              variant="plain"
                              size="small"
                              iconOnly
                              leadingIcon={RiDeleteBinLine}
                              aria-label={`Supprimer ${service.name}`}
                              className="hover:text-foreground-icon-error"
                              onClick={() => { if (confirm(`Supprimer ${service.name} ?`)) deleteService(service.id); }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        );
      case 'categories':
        return (
          <Panel
            title="Catégories"
            subtitle="Les onglets de filtre de l'accueil."
            action={<Button leadingIcon={RiAddLine} onClick={() => setIsCreatingCategory(true)}>Ajouter une catégorie</Button>}
          >
            {data.categories.length === 0 ? (
              <EmptyState>Aucune catégorie pour l'instant.</EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.categories.map(cat => {
                  const count = data.services.filter(s => s.categoryId === cat.id).length;
                  return (
                    <div key={cat.id} className="flex items-center justify-between gap-3 rounded-2xl bg-background-primary-default p-3 shadow-card">
                      <div className="flex min-w-0 items-center gap-3">
                        <IconPreview name={cat.icon} />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-body-medium text-text-primary">{cat.name}</span>
                          <span className="truncate text-body-2-regular text-text-tertiary">
                            {count} service{count > 1 ? 's' : ''} · {cat.icon}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button variant="plain" size="small" iconOnly leadingIcon={RiEditLine} aria-label={`Modifier ${cat.name}`} onClick={() => setEditingCategory(cat)} />
                        <Button
                          variant="plain"
                          size="small"
                          iconOnly
                          leadingIcon={RiDeleteBinLine}
                          aria-label={`Supprimer ${cat.name}`}
                          className="hover:text-foreground-icon-error"
                          onClick={() => { if (confirm('Supprimer la catégorie ? Les services associés seront supprimés.')) deleteCategory(cat.id); }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        );
      case 'integrations':
        return <IntegrationsEditor />;
      case 'theme':
        return <ThemeEditor />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Administration"
        subtitle="Services, catégories et apparence du portail · Ctrl + , pour revenir"
        actions={
          !editing && (
            <SegmentedControl<Tab>
              label="Section"
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { key: 'services', label: 'Services', count: data.services.length },
                { key: 'categories', label: 'Catégories', count: data.categories.length },
                { key: 'integrations', label: 'Intégrations' },
                { key: 'theme', label: 'Thème' },
              ]}
            />
          )
        }
      />
      {renderContent()}
    </div>
  );
};
