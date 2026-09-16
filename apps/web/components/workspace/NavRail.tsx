'use client';

import { Github, Map, Sun, Moon, LogOut, MessageCircle, Paintbrush, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useThemeStore } from '../../stores/theme';
import { useWorkspacePanels } from '../../contexts/WorkspaceDomains';
import { logoutSession } from '../../lib/authSession';
import { HexMark } from '../Logo';
import { IconButton, Badge } from '../ui';

export function NavRail() {
  const router = useRouter();
  const { theme, toggleTheme } = useThemeStore();
  const { membersOpen, setMembersOpen, decoratorMode, setDecoratorMode, messagingOpen, setMessagingOpen, totalUnread, mapsOpen, setMapsOpen } = useWorkspacePanels();

  function handleLogout() {
    void logoutSession();
    router.push('/login');
  }

  return (
    <div className="flex h-full w-14 flex-col items-center justify-between border-r border-[var(--color-border)] bg-[var(--color-panel-bg)] py-3">
      <div className="flex flex-col items-center gap-2">
        {/* Logo */}
        <div className="mb-2" title="NestWork">
          <HexMark size={34} />
        </div>
        {/* Members panel toggle */}
        <IconButton
          tone="auto"
          active={membersOpen}
          aria-pressed={membersOpen}
          onClick={() => setMembersOpen(!membersOpen)}
          title={membersOpen ? 'Masquer les membres' : 'Afficher les membres'}
          aria-label={membersOpen ? 'Masquer les membres' : 'Afficher les membres'}
          icon={<Users size={20} />}
        />
        {/* Map library (save / load map templates) */}
        <IconButton
          tone="auto"
          active={mapsOpen}
          aria-pressed={mapsOpen}
          onClick={() => setMapsOpen(!mapsOpen)}
          title="Bibliothèque de cartes"
          aria-label="Bibliothèque de cartes"
          icon={<Map size={20} />}
        />
        {/* Decorate toggle */}
        <IconButton
          tone="auto"
          active={decoratorMode}
          aria-pressed={decoratorMode}
          onClick={() => setDecoratorMode(!decoratorMode)}
          title="Décorer l'espace"
          aria-label="Décorer l'espace"
          icon={<Paintbrush size={20} />}
        />
        {/* Messagerie */}
        <div className="relative">
          <IconButton
            tone="auto"
            active={messagingOpen}
            aria-pressed={messagingOpen}
            onClick={() => setMessagingOpen(!messagingOpen)}
            title="Messagerie"
            aria-label="Messagerie"
            icon={<MessageCircle size={20} />}
          />
          {!messagingOpen && (
            <Badge count={totalUnread} className="pointer-events-none absolute -right-0.5 -top-0.5" />
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <a
          href="https://github.com/SergeiBasnya/NestWork"
          target="_blank"
          rel="noreferrer"
          title="Code source de NestWork"
          aria-label="Ouvrir le code source de NestWork"
          className="inline-flex h-10 w-10 items-center justify-center rounded-da-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
        >
          <Github size={20} />
        </a>
        <IconButton
          tone="auto"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}
          aria-label={theme === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair'}
          icon={theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        />
        <IconButton
          tone="auto"
          onClick={handleLogout}
          title="Déconnexion"
          aria-label="Déconnexion"
          className="hover:text-error"
          icon={<LogOut size={20} />}
        />
      </div>
    </div>
  );
}
