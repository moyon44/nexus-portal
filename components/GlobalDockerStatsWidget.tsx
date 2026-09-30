import React from 'react';
import { useGlobalDockerStats } from '../hooks/useGlobalDockerStats';
import { Big, Dot, Rail, Row, WidgetShell, usageTone } from './ui/widget';

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${sizes[i]}`;
};

interface GlobalDockerStatsWidgetProps {
  enabled?: boolean;
}

/** Docker host overview as a dashboard tile. */
export const GlobalDockerStatsWidget: React.FC<GlobalDockerStatsWidgetProps> = ({ enabled = true }) => {
  const { stats, isConnected, isLoading, error } = useGlobalDockerStats(enabled);

  if (!enabled) return null;

  const meta = (
    <span className="flex items-center gap-1.5">
      <Dot tone={isConnected ? 'ok' : 'idle'} pulse={isConnected} />
      {isConnected ? 'En direct' : 'Déconnecté'}
    </span>
  );

  if (isLoading) {
    return (
      <WidgetShell title="Docker">
        <p className="mt-auto text-body-2-regular text-text-tertiary">Chargement…</p>
      </WidgetShell>
    );
  }

  if (error || !stats) {
    return (
      <WidgetShell title="Docker">
        <p className="mt-auto text-body-2-regular text-text-error-primary">
          Statistiques Docker indisponibles{error ? ` : ${error}` : ''}
        </p>
      </WidgetShell>
    );
  }

  const m = stats.aggregatedMetrics;

  return (
    <WidgetShell title="Docker" meta={meta}>
      <Big unit={`/ ${stats.totalContainers} conteneurs`}>{stats.runningContainers}</Big>
      <dl className="mt-auto flex flex-col gap-2">
        <Row value={`${m.avgCpuPercent.toFixed(1)} %`}>Processeur (moyenne)</Row>
        <Rail pct={m.avgCpuPercent} tone={usageTone(m.avgCpuPercent)} />
        <Row value={`${formatBytes(m.totalRamUsed)} · ${m.totalRamPercent.toFixed(1)} %`}>Mémoire</Row>
        <Rail pct={m.totalRamPercent} tone={usageTone(m.totalRamPercent)} />
        <Row value={`${formatBytes(m.totalNetworkRx)} ↓ · ${formatBytes(m.totalNetworkTx)} ↑`}>Réseau</Row>
        {stats.stoppedContainers > 0 && (
          <Row value={stats.stoppedContainers}>
            <Dot tone="err" /> Arrêtés
          </Row>
        )}
      </dl>
    </WidgetShell>
  );
};
