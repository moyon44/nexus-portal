import React, { useEffect, useState } from 'react';
import {
  RiCheckLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiRefreshLine,
  RiShutDownLine,
} from '@remixicon/react';
import { Service } from '../types';
import { IconRenderer } from './IconRenderer';
import { DockerMetrics } from './DockerMetrics';
import { DockerLogViewer } from './DockerLogViewer';
import { dockerApi } from '../api';
import { useDashboard } from '../store';
import { Button } from './ui/button';
import { Chip, StatusDot } from './ui/badge';
import { SectionLabel } from './ui/panel';
import { cx } from '../utils/cx';

interface ServiceDrawerProps {
  service: Service | null;
  onClose: () => void;
}

const STATUS = {
  online: { tone: 'lime', dot: 'green', label: 'En ligne' },
  offline: { tone: 'rose', dot: 'red', label: 'Hors ligne' },
  maintenance: { tone: 'yellow', dot: 'yellow', label: 'Maintenance' },
  unknown: { tone: 'neutral', dot: 'neutral', label: 'Inconnu' },
  loading: { tone: 'neutral', dot: 'neutral', label: 'Vérification…' },
} as const;

const MORPHS = typeof document !== 'undefined' && ('startViewTransition' in document && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Floating slide-over with a service's live metrics, details and logs. */
export const ServiceDrawer: React.FC<ServiceDrawerProps> = ({ service, onClose }) => {
  const { data } = useDashboard();
  const [loadingAction, setLoadingAction] = useState<'restart' | 'stop' | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [containerStatus, setContainerStatus] = useState<Service['status'] | 'loading'>(service?.status || 'online');

  const docker = service?.stats?.dockerEnabled && service?.stats?.dockerContainer ? service.stats.dockerContainer : null;

  useEffect(() => {
    if (service) {
      setContainerStatus(service.status);
      setFeedback(null);
    }
  }, [service]);

  useEffect(() => {
    if (!service) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [service, onClose]);

  // Monitor container status in real-time if Docker is enabled
  useEffect(() => {
    if (!docker) return;
    const checkContainerStatus = async () => {
      try {
        const stats = await dockerApi.getStats(docker);
        setContainerStatus(stats.status === 'running' ? 'online' : 'offline');
      } catch (e) {
        console.error('Error checking container status:', e);
      }
    };
    checkContainerStatus();
    const interval = setInterval(checkContainerStatus, 5000);
    return () => clearInterval(interval);
  }, [docker]);

  if (!service) return null;

  const handleAction = async (action: 'restart' | 'stop') => {
    if (!docker) {
      setFeedback({ ok: false, message: 'Aucun conteneur Docker configuré pour ce service.' });
      return;
    }
    setLoadingAction(action);
    setFeedback(null);
    try {
      if (action === 'restart') {
        await dockerApi.restartContainer(docker);
        setFeedback({ ok: true, message: 'Conteneur redémarré.' });
      } else {
        await dockerApi.stopContainer(docker);
        setFeedback({ ok: true, message: 'Conteneur arrêté.' });
      }
    } catch (error: any) {
      setFeedback({ ok: false, message: error.message || "L'action a échoué." });
    } finally {
      setLoadingAction(null);
    }
  };

  const status = STATUS[containerStatus] ?? STATUS.unknown;
  const category = data.categories.find(c => c.id === service.categoryId)?.name ?? 'Sans catégorie';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={service.name}
        // The tile morphs into this panel (view transition); slide-in otherwise.
        style={{ viewTransitionName: 'service-detail' }}
        className={cx(
          !MORPHS && 'animate-panel-in',
          'fixed inset-y-3 right-3 z-50 flex w-[calc(100%-24px)] flex-col overflow-hidden md:w-[480px]',
          'rounded-3xl border border-border-button-white bg-background-secondary-default shadow-waitlist',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-separator-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-stat-card-icon-background text-foreground-icon-primary shadow-card">
              <IconRenderer name={service.icon} size={26} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-title-3-semibold text-text-primary">{service.name}</h2>
              <Chip tone={status.tone} className="mt-1">
                <StatusDot color={status.dot} className="-ml-0.5 bg-transparent" />
                {status.label}
              </Chip>
            </div>
          </div>
          <Button variant="plain" iconOnly leadingIcon={RiCloseLine} onClick={onClose} aria-label="Fermer" />
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="col-span-2"
              leadingIcon={RiExternalLinkLine}
              onClick={() => window.open(service.url, service.openInNewTab ? '_blank' : '_self')}
            >
              Ouvrir le service
            </Button>
            <Button
              variant="secondary"
              leadingIcon={RiRefreshLine}
              iconClassName={loadingAction === 'restart' ? 'animate-spin' : undefined}
              onClick={() => handleAction('restart')}
              disabled={!!loadingAction || !docker}
            >
              Redémarrer
            </Button>
            <Button
              variant="danger"
              leadingIcon={RiShutDownLine}
              onClick={() => {
                if (window.confirm(`Arrêter le conteneur ${docker} ?`)) handleAction('stop');
              }}
              disabled={!!loadingAction || !docker}
            >
              Arrêter
            </Button>
          </div>
          {feedback && (
            <p
              className={cx(
                'flex items-center gap-2 rounded-2lg px-3 py-2 text-body-2-medium',
                feedback.ok
                  ? 'bg-status-lime-background text-status-lime-text'
                  : 'bg-status-rose-background text-status-rose-text',
              )}
            >
              {feedback.ok ? <RiCheckLine className="size-4" aria-hidden /> : <RiErrorWarningLine className="size-4" aria-hidden />}
              {feedback.message}
            </p>
          )}

          {/* Metrics */}
          {docker ? (
            <DockerMetrics
              serviceId={service.id}
              containerName={docker}
              alertThresholds={service.stats?.alertThresholds}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <SectionLabel>Métriques</SectionLabel>
              <p className="rounded-2xl border border-dashed border-border-button-default p-4 text-body-2-regular text-text-tertiary">
                Surveillance Docker non activée. Choisissez un conteneur dans Administration → Services pour
                afficher CPU, mémoire, réseau et journaux en direct.
              </p>
            </div>
          )}

          {/* Details */}
          <div className="flex flex-col gap-2">
            <SectionLabel>Détails</SectionLabel>
            <dl className="flex flex-col text-body-2-regular">
              {[
                ['Catégorie', category],
                ['Adresse', service.url],
                ...(docker ? [['Conteneur', docker]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 border-b border-separator-border py-2.5">
                  <dt className="text-text-tertiary">{k}</dt>
                  <dd className="min-w-0 truncate text-text-primary">{v}</dd>
                </div>
              ))}
              {service.tags.length > 0 && (
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-text-tertiary">Étiquettes</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {service.tags.map(t => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {docker && <DockerLogViewer containerId={docker} maxHeight="320px" />}
        </div>
      </div>
    </>
  );
};
