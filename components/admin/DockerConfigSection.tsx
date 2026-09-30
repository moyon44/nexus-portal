import React, { useState, useEffect } from 'react';
import { RiCheckLine, RiCloseLine, RiRefreshLine } from '@remixicon/react';
import { Service } from '../../types';
import { dockerApi } from '../../api';
import { Button } from '../ui/button';
import { Field, Select, Switch } from '../ui/form';
import { cx } from '../../utils/cx';

interface DockerConfigSectionProps {
  service: Service;
  onUpdate: (service: Service) => Promise<void>;
}

export const DockerConfigSection: React.FC<DockerConfigSectionProps> = ({ service, onUpdate }) => {
  const [containers, setContainers] = useState<any[]>([]);
  const [selectedContainer, setSelectedContainer] = useState(service.stats?.dockerContainer || '');
  const [dockerEnabled, setDockerEnabled] = useState(service.stats?.dockerEnabled || false);
  const [cpuThreshold, setCpuThreshold] = useState(service.stats?.alertThresholds?.cpuPercent || 80);
  const [ramThreshold, setRamThreshold] = useState(service.stats?.alertThresholds?.ramPercent || 80);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    dockerApi
      .getContainers()
      .then(setContainers)
      .catch((error) => console.error('Failed to load containers:', error));
  }, []);

  // Keep the parent form in sync so "Enregistrer" saves the Docker settings too.
  useEffect(() => {
    onUpdate({
      ...service,
      stats: {
        ...service.stats,
        dockerEnabled,
        dockerContainer: selectedContainer || undefined,
        alertThresholds: { cpuPercent: cpuThreshold, ramPercent: ramThreshold },
      },
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockerEnabled, selectedContainer, cpuThreshold, ramThreshold]);

  const handleTestConnection = async () => {
    if (!selectedContainer) {
      setTestResult({ success: false, message: 'Choisissez un conteneur' });
      return;
    }
    setTesting(true);
    try {
      const stats = await dockerApi.getStats(selectedContainer);
      if (stats && stats.status) {
        setTestResult({ success: true, message: `Connecté · statut : ${stats.status}` });
      } else {
        setTestResult({ success: false, message: 'Réponse invalide du conteneur' });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border-button-default p-4">
      <Switch
        checked={dockerEnabled}
        onChange={setDockerEnabled}
        label="Surveillance Docker"
        description="CPU, mémoire, réseau et journaux du conteneur en direct."
      />

      {dockerEnabled && (
        <>
          <Select
            label="Conteneur"
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
          >
            <option value="">Choisir un conteneur…</option>
            {containers.map((container) => (
              <option key={container.id} value={container.name}>
                {container.name} ({container.image})
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={`Alerte processeur : ${cpuThreshold} %`} hint={`Alerte au-delà de ${cpuThreshold} %`}>
              <input
                type="range"
                min="0"
                max="100"
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(parseInt(e.target.value))}
                className="w-full cursor-pointer"
                aria-label="Seuil d'alerte processeur"
              />
            </Field>
            <Field label={`Alerte mémoire : ${ramThreshold} %`} hint={`Alerte au-delà de ${ramThreshold} %`}>
              <input
                type="range"
                min="0"
                max="100"
                value={ramThreshold}
                onChange={(e) => setRamThreshold(parseInt(e.target.value))}
                className="w-full cursor-pointer"
                aria-label="Seuil d'alerte mémoire"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiRefreshLine}
              iconClassName={testing ? 'animate-spin' : undefined}
              onClick={handleTestConnection}
              disabled={testing || !selectedContainer}
            >
              {testing ? 'Test en cours…' : 'Tester la connexion'}
            </Button>
            {testResult && (
              <span
                className={cx(
                  'flex items-center gap-1.5 text-body-2-medium',
                  testResult.success ? 'text-status-lime-text' : 'text-status-rose-text',
                )}
              >
                {testResult.success ? (
                  <RiCheckLine className="size-4" aria-hidden />
                ) : (
                  <RiCloseLine className="size-4" aria-hidden />
                )}
                {testResult.message}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
