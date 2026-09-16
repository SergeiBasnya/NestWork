'use client';

import { Plus, Minus } from 'lucide-react';
import { useWorkspacePanels } from '../../contexts/WorkspaceDomains';

// Calls the zoom hook exposed by the Phaser scene.
function zoom(factor: number) {
  (window as { __nwZoom?: (f: number) => void }).__nwZoom?.(factor);
}

export function ZoomControls() {
  const { mapsOpen, messagingOpen } = useWorkspacePanels();
  // The zoom buttons sit on the right edge — hide them while a right-docked panel
  // (maps library / messaging) is open so they don't overlap its content.
  if (mapsOpen || messagingOpen) return null;

  return (
    <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-lg">
      <button
        onClick={() => zoom(1.2)}
        title="Zoom avant"
        className="flex h-9 w-9 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
      >
        <Plus size={18} />
      </button>
      <div className="h-px bg-[var(--color-border)]" />
      <button
        onClick={() => zoom(1 / 1.2)}
        title="Zoom arrière"
        className="flex h-9 w-9 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
      >
        <Minus size={18} />
      </button>
    </div>
  );
}
