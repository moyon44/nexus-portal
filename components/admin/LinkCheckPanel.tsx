import React, { useEffect, useState } from 'react';
import { RiCheckLine, RiLinkUnlink, RiLoader4Line, RiSearchEyeLine } from '@remixicon/react';
import { linksApi, type LinkCheckReport } from '../../api';
import { useDashboard } from '../../store';
import { Panel } from '../ui/panel';
import { Button } from '../ui/button';

/**
 * Admin → Services: checks every external link (backend services/linkcheck.ts,
 * also run daily) — fills a missing or broken icon, an empty description, a
 * name that is only the address or a long page title — and lists the links
 * that are dead. Every change is in the history (System page).
 */

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

export function LinkCheckPanel() {
  const { refetch } = useDashboard();
  const [report, setReport] = useState<LinkCheckReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    linksApi.lastCheck().then(setReport).catch(() => undefined);
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await linksApi.check();
      setReport(r);
      await refetch();
      window.dispatchEvent(new Event('portail:link-checks'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vérification impossible');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel
      title="Vérifier les liens"
      subtitle={
        report
          ? `${report.checked} liens externes vérifiés ${when(report.checkedAt)} · vérification automatique chaque jour`
          : "Complète les icônes, descriptions et noms manquants des liens externes, et repère les liens morts. Se fait aussi tout seul chaque jour."
      }
      action={
        <Button leadingIcon={running ? RiLoader4Line : RiSearchEyeLine} onClick={() => void run()} disabled={running}>
          {running ? 'Vérification…' : 'Vérifier maintenant'}
        </Button>
      }
    >
      {error && <p className="text-body-2-regular text-text-error-primary">{error}</p>}
      {running && <p className="text-body-2-regular text-text-tertiary">Chaque site est consulté : ça peut prendre une minute.</p>}
      {report && !running && (
        <div className="flex flex-col gap-4">
          {report.filled.length === 0 && report.dead.length === 0 && (
            <p className="flex items-center gap-2 text-body-2-regular text-text-secondary">
              <RiCheckLine className="size-4 text-status-lime-text" aria-hidden /> Tout est en ordre.
            </p>
          )}
          {report.filled.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">Complétés ({report.filled.length})</h3>
              <ul className="flex flex-col gap-1">
                {report.filled.map(f => (
                  <li key={f.id} className="text-body-2-regular">
                    <span className="font-medium text-text-primary">{f.name}</span>
                    <span className="text-text-tertiary"> · {f.changes.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.dead.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">Liens morts ({report.dead.length})</h3>
              <ul className="flex flex-col gap-1">
                {report.dead.map(d => (
                  <li key={d.id} className="flex min-w-0 items-center gap-2 text-body-2-regular">
                    <RiLinkUnlink className="size-4 shrink-0 text-status-yellow-text" aria-hidden />
                    <span className="font-medium text-text-primary">{d.name}</span>
                    <span className="text-text-tertiary">· {d.reason}</span>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-text-tertiary underline-offset-2 hover:underline">
                      {d.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
