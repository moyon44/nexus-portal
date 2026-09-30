import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  ReactNode,
} from 'react';
import { cx, sortCx } from '../../utils/cx';

/**
 * BoardUI button, same recipe as Jellydash's components/base/buttons/button:
 * primary is the accent gradient (bg-button-primary), secondary a bordered
 * surface, ghost a tinted accent fill, danger the red gradient.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'plain';
export type ButtonSize = 'medium' | 'small' | 'xs';

export type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

const styles = sortCx({
  base: [
    'inline-flex items-center justify-center gap-0.5 whitespace-nowrap overflow-hidden',
    'font-sans select-none cursor-pointer',
    'button-press-motion',
    'outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring',
    'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
  ].join(' '),
  size: {
    medium: 'h-9 rounded-2lg p-2 text-body-medium',
    small: 'h-8 rounded-lg px-2 py-1.5 text-body-medium',
    xs: 'h-6 rounded-sm px-2 text-caption-1-semibold',
  },
  iconOnlySize: {
    medium: 'size-9',
    small: 'size-8 p-0',
    xs: 'size-6 p-0',
  },
  icon: {
    medium: 'size-5 shrink-0',
    small: 'size-[18px] shrink-0',
    xs: 'size-3.5 shrink-0',
  },
  label: {
    medium: 'inline-flex items-center justify-center px-1 shrink-0',
    small: 'inline-flex items-center justify-center px-0.5 shrink-0',
    xs: 'inline-flex items-center justify-center px-0.5 shrink-0',
  },
  variant: {
    primary: [
      'bg-button-primary text-text-white shadow-xs',
      'disabled:text-button-primary-disabled-foreground disabled:shadow-none',
    ].join(' '),
    danger: [
      'bg-button-danger text-text-white shadow-xs',
      'disabled:text-foreground-disabled-danger disabled:shadow-none',
    ].join(' '),
    secondary: [
      'bg-background-primary-default text-text-primary',
      'border border-border-button-default shadow-xs',
      'hover:bg-background-primary-hover hover:border-border-button-hover',
      'active:bg-background-primary-active active:border-border-button-active',
      'disabled:bg-background-primary-disabled disabled:border-border-button-default disabled:text-text-tertiary disabled:shadow-none',
    ].join(' '),
    ghost: [
      'bg-button-ghost-background text-button-ghost-foreground',
      'hover:bg-button-ghost-hover active:bg-button-ghost-active',
      'disabled:bg-button-ghost-disabled disabled:text-button-ghost-disabled-foreground',
    ].join(' '),
    /** Icon-only toolbar button: no surface until hovered. */
    plain: [
      'text-foreground-icon-secondary',
      'hover:bg-background-secondary-hover hover:text-foreground-icon-primary',
      'disabled:text-icon-button-disabled-foreground disabled:hover:bg-transparent',
    ].join(' '),
  },
});

export function buttonClasses({
  variant = 'primary',
  size = 'medium',
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
} = {}) {
  return cx(
    styles.base,
    styles.size[size],
    styles.variant[variant],
    iconOnly && styles.iconOnlySize[size],
    className,
  );
}

function Content({
  size,
  iconOnly,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  iconClassName,
  children,
}: {
  size: ButtonSize;
  iconOnly: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  iconClassName?: string;
  children?: ReactNode;
}) {
  return (
    <>
      {Leading ? <Leading className={cx(styles.icon[size], iconClassName)} aria-hidden /> : null}
      {!iconOnly && children !== undefined && children !== null && (
        <span className={styles.label[size]}>{children}</span>
      )}
      {!iconOnly && Trailing ? <Trailing className={styles.icon[size]} aria-hidden /> : null}
    </>
  );
}

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  /** Extra classes for the leading icon (e.g. `animate-spin`). */
  iconClassName?: string;
  children?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'medium',
  iconOnly = false,
  leadingIcon,
  trailingIcon,
  iconClassName,
  children,
  className,
  type = 'button',
  ...props
}: Shared & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, iconOnly, className })}
      {...props}
    >
      <Content
        size={size}
        iconOnly={iconOnly}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
        iconClassName={iconClassName}
      >
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'medium',
  iconOnly = false,
  leadingIcon,
  trailingIcon,
  iconClassName,
  children,
  className,
  ...props
}: Shared & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>) {
  return (
    <a className={buttonClasses({ variant, size, iconOnly, className })} {...props}>
      <Content
        size={size}
        iconOnly={iconOnly}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
        iconClassName={iconClassName}
      >
        {children}
      </Content>
    </a>
  );
}
