import React from 'react';
import { RiArrowLeftDownLine, RiArrowRightUpLine } from '@remixicon/react';
import { useDockerStats } from '../hooks/useDockerStats';
import { Dot, Rail, TONE_TEXT, usageTone } from './ui/widget';
import { SectionLabel, Skeleton } from './ui/panel';
import { cx } from '../utils/cx';

interface DockerMetricsProps {
  serviceId: string;
  containerName?: string;
  alertThresholds?: {
    cpuPercent?: number;
    ramPercent?: number;
  };
}

const formatGb = (bytes: number) =>
  `${(bytes / 1024 / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;

function Metric({ label, value, max }: { label: string; value: number; max?: number }) {
  const tone = usageTone(value, max ?? 80);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-background-primary-default p-3 shadow-card">
      <span className="text-body-2-regular text-text-tertiary">{label}</span>
      <span className={cx('text-title-2-medium tabular-nums', tone === 'ok' ? 'text-text-primary' : TONE_TEXT[tone])}>
        {value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        <span className="text-body-2-regular text-text-tertiary"> %</span>
      </span>
      <Rail pct={value} tone={tone} />
    </div>
  );
}

export const DockerMetrics: React.FC<DockerMetricsProps> = ({
  containerName,
  alertThresholds = { cpuPercent: 80, ramPercent: 80 },
}) => {
  const { stats, isConnected, error } = useDockerStats(containerName || '', !!containerName);

  if (error && !stats) {
    return (
      <div className="flex flex-col gap-2">
        <SectionLabel>Métriques</SectionLabel>
        <div className="rounded-2xl bg-status-rose-background p-4 text-body-2-regular text-status-rose-text">
          <p className="text-body-2-medium">Erreur de surveillance</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 opacity-80">Conteneur : {containerName}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col gap-2">
        <SectionLabel>Métriques</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Métriques en direct</SectionLabel>
        <span className="flex items-center gap-1.5 text-body-2-regular text-text-tertiary">
          <Dot tone={isConnected ? 'ok' : 'idle'} pulse={isConnected} />
          {isConnected ? 'En direct' : 'Déconnecté'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Processeur" value={stats.cpu ?? 0} max={alertThresholds.cpuPercent} />
        <Metric label="Mémoire" value={stats.ram ?? 0} max={alertThresholds.ramPercent} />
        <div className="flex flex-col gap-2 rounded-2xl bg-background-primary-default p-3 shadow-card">
          <span className="text-body-2-regular text-text-tertiary">Disponibilité</span>
          <span className="truncate text-title-2-medium text-text-primary tabular-nums">{stats.uptime}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-body-2-regular">
        <div className="flex items-center justify-between gap-2 rounded-2lg bg-background-tertiary-default px-3 py-2">
          <dt className="flex items-center gap-1.5 text-text-tertiary">
            <RiArrowLeftDownLine className="size-4 text-chart-4" aria-hidden /> Reçu
          </dt>
          <dd className="text-text-primary tabular-nums">{formatGb(stats.networkRx)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-2lg bg-background-tertiary-default px-3 py-2">
          <dt className="flex items-center gap-1.5 text-text-tertiary">
            <RiArrowRightUpLine className="size-4 text-chart-5" aria-hidden /> Envoyé
          </dt>
          <dd className="text-text-primary tabular-nums">{formatGb(stats.networkTx)}</dd>
        </div>
      </dl>
    </div>
  );
};
