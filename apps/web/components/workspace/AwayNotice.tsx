'use client';

import { Inbox, MessageSquare, AtSign, X } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';

// Bandeau "pendant ton absence" : surgit au (ré)ouverture du workspace si des MP
// ou des mentions @toi se sont accumulés. Cliquer une ligne ouvre la conversation.
export function AwayNotice() {
  const { awayNotice, dismissAwayNotice, setMessagingOpen, setActiveChannel } = useWorkspace();
  if (!awayNotice) return null;

  const open = (id: string) => {
    setMessagingOpen(true);
    setActiveChannel(id);
    dismissAwayNotice();
  };

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-30 w-[min(92vw,360px)] -translate-x-1/2">
      <div className="pointer-events-auto overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Inbox size={16} className="text-honey" /> Pendant ton absence
          </span>
          <button
            onClick={dismissAwayNotice}
            title="Masquer"
            className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        <ul className="max-h-64 overflow-auto py-1">
          {awayNotice.dms.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => open(d.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover-bg)]"
              >
                <MessageSquare size={14} className="shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{d.count}</span> message{d.count > 1 ? 's' : ''} privé{d.count > 1 ? 's' : ''} de{' '}
                  <span className="font-medium">{d.name}</span>
                </span>
                <span className="shrink-0 rounded-full bg-red px-1.5 text-xs font-semibold leading-5 text-white">{d.count}</span>
              </button>
            </li>
          ))}
          {awayNotice.mentions.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => open(m.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover-bg)]"
              >
                <AtSign size={14} className="shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{m.count}</span> mention{m.count > 1 ? 's' : ''} dans{' '}
                  <span className="font-medium">#{m.name}</span>
                </span>
                <span className="shrink-0 rounded-full bg-honey px-1.5 text-xs font-semibold leading-5 text-hive-800">{m.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
