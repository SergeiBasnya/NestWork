'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';

export interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  deskX?: number | null;
  deskY?: number | null;
  user: { id: string; name: string; email: string; avatarUrl: string | null; status: string };
}

export interface Desk {
  userId: string;
  x: number;
  y: number;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  members: Member[];
  rooms: Room[];
}

export interface WorkspacePresenceContextValue {
  slug: string;
  workspace: WorkspaceDetail | null;
  members: Member[];
  rooms: Room[];
  socket: Socket | null;
  connected: boolean;
  onlineUserIds: string[];
  statusByUserId: Record<string, string>;
  setMyStatus: (status: string) => void;
  dndByUserId: Record<string, boolean>;
  setMyDnd: (dnd: boolean) => void;
  goToUser: (userId: string) => void;
  goToMyDesk: () => void;
  refreshPresence: () => void;
  desks: Desk[];
  myDesk: { x: number; y: number } | null;
  claimDesk: () => void;
  clearDesk: () => void;
  loading: boolean;
  error: string;
  currentRoomName: string | null;
  setCurrentRoomName: (name: string | null) => void;
  refetchWorkspace: () => Promise<void>;
}

export interface WorkspacePanelsContextValue {
  membersOpen: boolean;
  setMembersOpen: (open: boolean) => void;
  mapsOpen: boolean;
  setMapsOpen: (open: boolean) => void;
  decoratorMode: boolean;
  setDecoratorMode: (mode: boolean) => void;
  messagingOpen: boolean;
  setMessagingOpen: (open: boolean) => void;
  totalUnread: number;
}

const WorkspacePresenceContext = createContext<WorkspacePresenceContextValue | null>(null);
const WorkspacePanelsContext = createContext<WorkspacePanelsContextValue | null>(null);

export function WorkspaceDomainProviders({
  presence,
  panels,
  children,
}: {
  presence: WorkspacePresenceContextValue;
  panels: WorkspacePanelsContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspacePresenceContext.Provider value={presence}>
      <WorkspacePanelsContext.Provider value={panels}>{children}</WorkspacePanelsContext.Provider>
    </WorkspacePresenceContext.Provider>
  );
}

export function useWorkspacePresence() {
  const ctx = useContext(WorkspacePresenceContext);
  if (!ctx) throw new Error('useWorkspacePresence must be used within WorkspaceProvider');
  return ctx;
}

export function useWorkspacePanels() {
  const ctx = useContext(WorkspacePanelsContext);
  if (!ctx) throw new Error('useWorkspacePanels must be used within WorkspaceProvider');
  return ctx;
}
