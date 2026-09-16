import type { HTMLAttributes } from 'react';

type Size = 'sm' | 'md' | 'lg';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Full display name — the first letter is used as the fallback initial. */
  name?: string | null;
  size?: Size;
  /**
   * Optional status dot. Pass a Tailwind background class (e.g. "bg-green").
   * When omitted, no dot is rendered.
   */
  statusDot?: string | null;
  /** Border colour class for the status-dot ring (matches the surface behind). */
  dotRingClass?: string;
}

const SIZES: Record<Size, { box: string; text: string; dot: string }> = {
  sm: { box: 'h-7 w-7', text: 'text-xs', dot: 'h-2.5 w-2.5' },
  md: { box: 'h-8 w-8', text: 'text-sm', dot: 'h-3 w-3' },
  lg: { box: 'h-10 w-10', text: 'text-base', dot: 'h-3.5 w-3.5' },
};

/**
 * Initial-based avatar with an optional status dot. Uses the themed honey
 * active treatment so the initial stays legible (AA) in both light and dark.
 */
export function Avatar({
  name,
  size = 'md',
  statusDot,
  dotRingClass = 'border-[var(--color-panel-bg)]',
  className = '',
  ...rest
}: AvatarProps) {
  const s = SIZES[size];
  const initial = (name?.charAt(0) ?? '?').toUpperCase();
  return (
    <div className={`relative shrink-0 ${className}`} {...rest}>
      <div
        className={`flex items-center justify-center rounded-full bg-[var(--color-active-bg)] font-semibold text-[var(--color-active-text)] ${s.box} ${s.text}`}
      >
        {initial}
      </div>
      {statusDot && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 ${s.dot} ${statusDot} ${dotRingClass}`}
        />
      )}
    </div>
  );
}
