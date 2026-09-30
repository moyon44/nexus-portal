import React from 'react';
import { useSystemStats } from '../hooks/useSystemStats';
import { Rail, TONE_TEXT, WidgetShell, usageTone } from './ui/widget';
import { cx } from '../utils/cx';

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${sizes[i]}`;
};

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return d > 0 ? `${d} j ${h} h` : `${h} h`;
};

interface SystemStatsWidgetProps {
  enabled?: boolean;
}

function Gauge({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const tone = usageTone(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-body-2-regular">
        <span className="text-text-primary">{label}</span>
        <span className="flex items-baseline gap-2 tabular-nums">
          {detail && <span className="text-text-tertiary">{detail}</span>}
          <span className={cx('text-body-2-medium', tone === 'ok' ? 'text-text-secondary' : TONE_TEXT[tone])}>
            {Math.round(value)}%
          </span>
        </span>
      </div>
      <Rail pct={value} tone={tone} />
    </div>
  );
}

/** Host CPU / memory / disk as a dashboard tile. */
export const SystemStatsWidget: React.FC<SystemStatsWidgetProps> = ({ enabled = true }) => {
  const { stats, isLoading, error } = useSystemStats(enabled);

  if (!enabled) return null;

  return (
    <WidgetShell title="Serveur" meta={stats ? `en ligne depuis ${formatUptime(stats.uptime)}` : undefined}>
      {isLoading && !stats ? (
        <p className="mt-auto text-body-2-regular text-text-tertiary">Chargement…</p>
      ) : error || !stats ? (
        <p className="mt-auto text-body-2-regular text-text-error-primary">
          Statistiques système indisponibles{error ? ` : ${error}` : ''}
        </p>
      ) : (
        <div className="mt-auto flex flex-col gap-3">
          <Gauge label="Processeur" value={stats.cpu.usage} detail={`${stats.cpu.count} cœurs`} />
          <Gauge
            label="Mémoire"
            value={stats.memory.usage}
            detail={`${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`}
          />
          <Gauge
            label="Disque"
            value={stats.disk.usage}
            detail={`${formatBytes(stats.disk.free)} libres`}
          />
        </div>
      )}
    </WidgetShell>
  );
};
