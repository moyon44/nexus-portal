import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

/** Titled card used for every section (Jellydash components/dashboard/panel). */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'flex min-w-0 flex-col gap-4 rounded-3xl border border-border-button-default bg-background-secondary-default p-5',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-title-3-semibold text-text-primary">{title}</h2>}
            {subtitle && <p className="text-body-2-regular text-text-tertiary">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-title-2-medium text-text-primary">{title}</h1>
          {subtitle && <p className="text-body-regular text-text-tertiary">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** Quiet uppercase label above a group, the widget-title look. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3
      className={cx(
        'text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase',
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-body-regular text-text-tertiary">{children}</p>;
}

export function ErrorState({ children }: { children?: ReactNode }) {
  return (
    <p className="py-6 text-center text-body-regular text-text-error-primary">
      {children ?? 'Impossible de charger les données. Le backend est-il joignable ?'}
    </p>
  );
}

/** Neutral placeholder block while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx('animate-pulse rounded-2xl bg-background-tertiary-default', className)}
    />
  );
}
