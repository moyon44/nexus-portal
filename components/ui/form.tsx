import { useId, type ComponentType, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { RiArrowDownSLine, RiCheckLine } from '@remixicon/react';
import { cx } from '../../utils/cx';

/**
 * Form fields on BoardUI tokens (Jellydash components/base/input, select,
 * switch, checkbox): tertiary fill, 36px tall, rounded-2lg, a hover ring and
 * the accent focus ring.
 */

const FIELD = cx(
  'flex h-9 w-full items-center gap-1.5 rounded-2lg bg-background-tertiary-default px-2.5',
  'text-body-regular text-text-primary',
  'ring-1 ring-transparent transition-shadow duration-150 hover:ring-border-button-hover',
  'focus-within:ring-2 focus-within:ring-border-focus-ring',
);

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-body-medium text-text-secondary">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-body-2-regular text-text-tertiary">{hint}</p>}
    </div>
  );
}

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export function Input({
  label,
  hint,
  leadingIcon: Leading,
  trailing,
  className,
  id,
  ...props
}: {
  label?: ReactNode;
  hint?: ReactNode;
  leadingIcon?: IconComponent;
  /** Rendered inside the field, after the input (e.g. a clear button). */
  trailing?: ReactNode;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={className}>
      <div className={FIELD}>
        {Leading && <Leading className="size-5 shrink-0 text-foreground-icon-tertiary" aria-hidden />}
        <input
          id={inputId}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 outline-none placeholder:text-text-placeholder"
          {...props}
        />
        {trailing}
      </div>
    </Field>
  );
}

export function Select({
  label,
  hint,
  className,
  children,
  id,
  ...props
}: {
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field label={label} hint={hint} htmlFor={selectId} className={className}>
      <div className={cx(FIELD, 'relative pr-8')}>
        <select
          id={selectId}
          className="h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 outline-none"
          {...props}
        >
          {children}
        </select>
        <RiArrowDownSLine
          className="pointer-events-none absolute right-2 size-5 text-foreground-icon-tertiary"
          aria-hidden
        />
      </div>
    </Field>
  );
}

/** Pill switch with the accent gradient chip when on. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx('flex items-center justify-between gap-4', className)}>
      <label htmlFor={id} className="flex min-w-0 cursor-pointer flex-col">
        <span className="text-body-medium text-text-primary">{label}</span>
        {description && <span className="text-body-2-regular text-text-tertiary">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200',
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2',
          checked
            ? 'bg-linear-to-b from-switch-on-chip-start to-switch-on-chip-end'
            : 'bg-background-quaternary-default',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'size-4 rounded-full bg-control-indicator-background shadow-sm transition-transform duration-200 ease-out',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-body-regular text-text-primary', className)}>
      <span className="relative inline-flex size-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={cx(
            'peer size-4 cursor-pointer appearance-none rounded-[5px] border border-border-checkbox-default bg-background-primary-default',
            'transition-colors hover:border-border-checkbox-hover',
            'checked:border-transparent checked:bg-button-primary checked:shadow-checkbox-selected',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-1',
          )}
        />
        <RiCheckLine
          className="pointer-events-none absolute inset-0 m-auto size-3 text-white opacity-0 peer-checked:opacity-100"
          aria-hidden
        />
      </span>
      {label}
    </label>
  );
}
