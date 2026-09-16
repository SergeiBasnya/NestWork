import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Unread / notification count. Values > 9 render as "9+". */
  count: number;
  /** Localised noun for the accessible label, e.g. "non lus". */
  label?: string;
  /** Fill colour. "red" marks higher-signal counts (e.g. private messages). */
  tone?: 'honey' | 'red';
}

const TONE = {
  honey: 'bg-honey text-hive-800',
  red: 'bg-red text-white',
} as const;

/**
 * Pill counter used for unread badges (honey fill by default; red for higher-signal
 * counts like DMs). Renders nothing when count <= 0.
 */
export function Badge({ count, label = 'non lus', tone = 'honey', className = '', ...rest }: BadgeProps) {
  if (count <= 0) return null;
  const display = count > 9 ? '9+' : String(count);
  return (
    <span
      aria-label={`${count} ${label}`}
      className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${TONE[tone]} ${className}`}
      {...rest}
    >
      {display}
    </span>
  );
}
