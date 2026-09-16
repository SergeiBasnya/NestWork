'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'auto' | 'onDark';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name — required for icon-only buttons. */
  'aria-label': string;
  /** Icon content (usually a lucide icon). */
  icon: ReactNode;
  /** Highlight the button as the active/selected option (honey treatment). */
  active?: boolean;
  /**
   * Active intensity. `soft` = pale honey wash (selection/navigation).
   * `solid` = full honey fill with dark text (strong on/off device toggle).
   */
  activeStyle?: 'soft' | 'solid';
  /**
   * Surface context. `auto` follows the themed surface variables (use on light
   * panels). `onDark` keeps a dark base with bright honey accents (use on the
   * always-dark nav rail / media toolbar).
   */
  tone?: Tone;
  /** Square size in px (height = width). Defaults to 40 (h-10 w-10). */
  size?: number;
  /** Icon-button corner radius. Defaults to rounded-da-md (12px). */
  rounded?: string;
}

/**
 * Square icon button with readable active (honey) state in both themes.
 * `aria-label` is mandatory; pass `title` separately for the tooltip.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      active = false,
      activeStyle = 'soft',
      tone = 'auto',
      size = 40,
      rounded = 'rounded-da-md',
      className = '',
      type = 'button',
      style,
      ...rest
    },
    ref,
  ) {
    const base = `inline-flex items-center justify-center ${rounded} transition-colors disabled:cursor-not-allowed disabled:opacity-40`;

    const solidActive = 'bg-honey text-hive-800';
    const variant = active
      ? activeStyle === 'solid'
        ? solidActive
        : tone === 'onDark'
          ? 'bg-honey/15 text-honey-300 dark:text-honey'
          : 'bg-[var(--color-active-bg)] text-[var(--color-active-text)]'
      : tone === 'onDark'
        ? 'text-warm-300 hover:bg-hive-700 hover:text-warm-white'
        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]';

    return (
      <button
        ref={ref}
        type={type}
        className={`${base} ${variant} ${className}`}
        style={{ height: size, width: size, ...style }}
        {...rest}
        // Drop focus after a mouse toggle so the honey :focus-visible outline
        // doesn't linger around the button. Keyboard (Tab) focus is unaffected.
        onMouseUp={(e) => {
          rest.onMouseUp?.(e);
          e.currentTarget.blur();
        }}
      >
        {icon}
      </button>
    );
  },
);
