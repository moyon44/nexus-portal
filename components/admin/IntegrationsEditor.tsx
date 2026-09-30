import React, { useEffect, useState } from 'react';
import { RiCheckLine, RiErrorWarningLine, RiLoader4Line } from '@remixicon/react';
import { integrationsApi } from '../../api';
import { useDashboard } from '../../store';
import type { IntegrationConfig } from '../../types';
import { Panel } from '../ui/panel';
import { Input, Select, Switch } from '../ui/form';
import { Button } from '../ui/button';
import { LinkIcon } from '../LinkIcon';

/**
 * Admin → Intégrations: credentials for the live tile widgets. Secrets are
 * write-only: the page only knows whether one is stored, and an empty field
 * keeps it. Saving tests the connection right away.
 */

const META: Record<
  IntegrationConfig['type'],
  {
    name: string;
    what: string;
    url: string;
    key?: string;
    login?: boolean | { user: string; password: string };
    entities?: boolean;
    /** One more setting kept in options (e.g. kDrive's number). */
    option?: { key: string; label: string; placeholder: string; hint?: string };
  }
> = {
  qbittorrent: {
    name: 'qBittorrent',
    what: 'Vitesses de téléchargement et d’envoi, torrents en cours.',
    url: 'http://192.168.1.10:8080',
    login: true,
  },
  jellyfin: {
    name: 'Jellyfin',
    what: 'Lectures en cours (qui regarde quoi).',
    url: 'http://192.168.1.10:8096',
    key: 'Clé API (Tableau de bord → Clés API)',
  },
  sonarr: {
    name: 'Sonarr',
    what: 'Épisodes qui sortent aujourd’hui et file de téléchargement.',
    url: 'http://192.168.1.10:8989',
    key: 'Clé API (Paramètres → Général)',
  },
  radarr: {
    name: 'Radarr',
    what: 'Films qui sortent aujourd’hui et file de téléchargement.',
    url: 'http://192.168.1.10:7878',
    key: 'Clé API (Paramètres → Général)',
  },
  jellyseerr: {
    name: 'Jellyseerr',
    what: 'Demandes en attente d’approbation (titre et demandeur).',
    url: 'http://192.168.1.10:5055',
    key: 'Clé API (Paramètres → Général)',
  },
  nextcloud: {
    name: 'Nextcloud',
    what: 'Espace libre, activité, mise à jour en attente ; recherche de fichiers et maintenance dans Ctrl K.',
    url: 'http://192.168.1.10:8057',
    key: 'Jeton serverinfo (pour les chiffres de la tuile)',
    login: { user: 'Utilisateur (recherche de fichiers)', password: 'Mot de passe d’application (Paramètres → Sécurité)' },
  },
  kdrive: {
    name: 'kDrive',
    what: 'Espace utilisé et libre ; tes fichiers dans Ctrl K (groupe Fichiers).',
    url: 'https://api.infomaniak.com',
    key: 'Jeton API Infomaniak (portée « drive »)',
    option: {
      key: 'driveId',
      label: 'Numéro du kDrive',
      placeholder: '123456',
      hint: 'Le nombre après /drive/ dans l’adresse de ton kDrive sur le web.',
    },
  },
  homeassistant: {
    name: 'Home Assistant',
    what: 'Quelques capteurs (température, humidité…).',
    url: 'http://192.168.1.10:8123',
    key: 'Jeton d’accès longue durée (Profil → Sécurité)',
    entities: true,
  },
};

function IntegrationCard({ config, onSaved }: { config: IntegrationConfig; onSaved: () => void }) {
  const { data } = useDashboard();
  const meta = META[config.type];
  // Not set up yet: start from the usual local address rather than an empty
  // field (Save stays disabled while it's empty).
  const [url, setUrl] = useState(config.configured ? config.url : meta.url);
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState(config.username);
  const [password, setPassword] = useState('');
  const [entities, setEntities] = useState(config.options.entities ?? '');
  const [option, setOption] = useState(meta.option ? String(config.options[meta.option.key] ?? '') : '');
  const [serviceId, setServiceId] = useState(config.serviceId ?? '');
  const [enabled, setEnabled] = useState(config.configured ? config.enabled : true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    config.state ? { ok: config.state.ok, text: config.state.ok ? config.state.summary : config.state.error ?? 'Erreur' } : null,
  );

  const services = [...data.services].filter(s => s.isVisible).sort((a, b) => a.name.localeCompare(b.name));

  const save = async () => {
    setSaving(true);
    try {
      const r = await integrationsApi.save(config.type, {
        enabled,
        url,
        serviceId: serviceId || null,
        apiKey: apiKey || undefined,
        username,
        password: password || undefined,
        options: meta.entities ? { entities } : meta.option ? { [meta.option.key]: option.trim() } : {},
      });
      setResult({ ok: r.ok, text: r.ok ? r.summary ?? 'Connecté' : r.error ?? 'Échec' });
      setApiKey('');
      setPassword('');
      onSaved();
    } catch {
      setResult({ ok: false, text: 'Enregistrement impossible' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2.5">
          <LinkIcon service={{ name: meta.name, icon: '' }} size={22} />
          {meta.name}
        </span>
      }
      subtitle={meta.what}
    >
      <Input label="Adresse" value={url} placeholder={meta.url} onChange={e => setUrl(e.target.value)} />
      {meta.key && (
        <Input
          label={meta.key}
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={config.hasApiKey ? '•••••••• (enregistrée, laisser vide pour la garder)' : ''}
          onChange={e => setApiKey(e.target.value)}
        />
      )}
      {meta.login && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label={typeof meta.login === 'object' ? meta.login.user : 'Utilisateur'}
            value={username}
            autoComplete="off"
            onChange={e => setUsername(e.target.value)}
          />
          <Input
            label={typeof meta.login === 'object' ? meta.login.password : 'Mot de passe'}
            type="password"
            autoComplete="off"
            value={password}
            placeholder={config.hasPassword ? '•••••••• (enregistré)' : ''}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
      )}
      {meta.entities && (
        <Input
          hint={<a href="#/systeme/home-assistant" className="underline underline-offset-2 hover:text-text-primary">Choisir dans la liste des capteurs (Système → Home Assistant)</a>}
          label="Entités (séparées par des virgules)"
          value={entities}
          placeholder="sensor.salon_temperature, sensor.salon_humidite"
          onChange={e => setEntities(e.target.value)}
        />
      )}
      {meta.option && (
        <Input label={meta.option.label} hint={meta.option.hint} inputMode="numeric" value={option} placeholder={meta.option.placeholder} onChange={e => setOption(e.target.value)} />
      )}
      <Select label="Tuile" value={serviceId} onChange={e => setServiceId(e.target.value)}>
        <option value="">Automatique (d’après le nom)</option>
        {services.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Switch checked={enabled} onChange={setEnabled} label="Afficher sur la tuile" />
        <Button size="small" onClick={save} disabled={saving || !url.trim()} leadingIcon={saving ? RiLoader4Line : undefined}>
          Enregistrer et tester
        </Button>
      </div>
      {result && (
        <p className={`flex items-center gap-1.5 text-body-2-regular ${result.ok ? 'text-status-lime-text' : 'text-text-error-primary'}`}>
          {result.ok ? <RiCheckLine className="size-4 shrink-0" aria-hidden /> : <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />}
          {result.text}
        </p>
      )}
    </Panel>
  );
}

export function IntegrationsEditor() {
  const [configs, setConfigs] = useState<IntegrationConfig[] | null>(null);
  const [error, setError] = useState(false);
  const load = () =>
    integrationsApi
      .getAll()
      .then(setConfigs)
      .catch(() => setError(true));
  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-body-regular text-text-error-primary">Intégrations indisponibles.</p>;
  if (!configs) return <p className="text-body-regular text-text-tertiary">Chargement…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body-2-regular text-text-tertiary">
        Une ligne en direct sur la tuile du service. Utilisez l’adresse locale (IP:port) : les sous-domaines publics passent
        par Cloudflare Access, qui bloque les appels d’API. Les clés restent sur le serveur, elles ne sont jamais renvoyées
        au navigateur.
      </p>
      <div className="grid max-w-5xl grid-cols-1 gap-6 xl:grid-cols-2">
        {configs.map(c => (
          <IntegrationCard key={c.type} config={c} onSaved={load} />
        ))}
      </div>
    </div>
  );
}
