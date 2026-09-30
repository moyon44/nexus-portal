import React, { useRef, useEffect, useState } from 'react';
import { RiFileCopyLine } from '@remixicon/react';
import { useDockerLogs } from '../hooks/useDockerLogs';
import { Chip, type ChipTone } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/form';
import { SectionLabel } from './ui/panel';
import { Dot } from './ui/widget';

interface DockerLogViewerProps {
  containerId: string | null;
  maxHeight?: string;
}

/** Docker's multiplexed stream prefixes each frame with an 8-byte header
 *  (stream id, three zero bytes, a 4-byte length); drop it and any other
 *  control characters so only the log text shows. */
const clean = (message: string) =>
  message
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0003]\u0000\u0000\u0000[\s\S]{4}/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\ufffd]/g, '');

const LEVEL_TONE: Record<string, ChipTone> = {
  error: 'rose',
  warn: 'yellow',
  debug: 'blue',
  info: 'neutral',
};

export const DockerLogViewer: React.FC<DockerLogViewerProps> = ({ containerId, maxHeight = '400px' }) => {
  const { logs, isConnected, isLoading, error } = useDockerLogs(containerId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.map((log) => `[${log.timestamp}] ${log.message}`).join('\n'));
  };

  if (error && logs.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <SectionLabel>Journaux</SectionLabel>
        <div className="rounded-2xl bg-status-rose-background p-4 text-body-2-regular text-status-rose-text">
          <p className="text-body-2-medium">Flux de journaux interrompu</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 opacity-80">Vérifiez que le conteneur tourne et que la connexion est stable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <SectionLabel>Journaux</SectionLabel>
          <span className="flex items-center gap-1.5 text-body-2-regular text-text-tertiary">
            <Dot tone={isConnected ? 'ok' : 'idle'} pulse={isConnected} />
            {isConnected ? 'En direct' : 'Déconnecté'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked={autoScroll} onChange={setAutoScroll} label={<span className="text-body-2-regular text-text-secondary">Défilement auto</span>} />
          <Button
            variant="plain"
            size="small"
            iconOnly
            leadingIcon={RiFileCopyLine}
            onClick={handleCopyLogs}
            aria-label="Copier les journaux"
            title="Copier les journaux"
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-2xl bg-background-full p-3 font-mono text-caption-1-regular text-text-secondary"
        style={{ maxHeight, minHeight: '200px' }}
      >
        {isLoading && logs.length === 0 ? (
          <p className="py-4 text-center text-text-tertiary">Chargement des journaux…</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-text-tertiary">Aucun journal pour l'instant</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-background-secondary-default">
              <span className="shrink-0 text-text-tertiary">{log.timestamp}</span>
              <Chip tone={LEVEL_TONE[log.level] ?? 'neutral'} className="px-1 py-0 font-mono text-caption-2-medium">
                {log.level}
              </Chip>
              <span className="break-words text-text-primary">{clean(log.message)}</span>
            </div>
          ))
        )}
      </div>

      {logs.length > 0 && (
        <p className="text-right text-body-2-regular text-text-tertiary tabular-nums">
          {logs.length} ligne{logs.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};
