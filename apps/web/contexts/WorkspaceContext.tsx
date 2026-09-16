'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { api } from '../lib/api';
import { refreshAccessToken } from '../lib/authSession';
import { cachedFetch, invalidate } from '../lib/cache';
import { getSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../stores/auth';
import { Socket } from 'socket.io-client';
import type { FurnitureItem, FurnitureCatalogEntry, WorkspaceAsset } from '../game/furnitureTypes';
import {
  WorkspaceDomainProviders,
  type Desk,
  type WorkspaceDetail,
  type WorkspacePanelsContextValue,
  type WorkspacePresenceContextValue,
} from './WorkspaceDomains';
export { useWorkspacePanels, useWorkspacePresence } from './WorkspaceDomains';
export type { Desk, Member, Room, WorkspaceDetail } from './WorkspaceDomains';
import { generateOfficeMap, schematicPreview } from '../game/mapGenerator';
import { applyMapWithBackup } from '../lib/mapApply';
import type {
  ChannelDTO,
  DmDTO,
  MessageDTO,
  MessageNewPayload,
  ChannelCreatedPayload,
  MessageEditedPayload,
  MessageDeletedPayload,
  ReactionUpdatePayload,
  MapTemplateDTO,
  MapApplyAck,
  MapApplyPayload,
  FurnitureCommandAck,
  FurnitureDepthPayload,
  FurnitureMovePayload,
  FurniturePlacePayload,
  FurnitureRemovePayload,
  FurnitureTransformPayload,
  SpacePlayerPayload,
  MessageSendAck,
  WorkspaceAssetCreatePayload,
  WorkspaceAssetDTO,
} from '@nestwork/shared';

// Summary of unread DMs and @-mentions found when (re)opening the workspace.
export interface AwayNotice {
  dms: { id: string; name: string; count: number }[];
  mentions: { id: string; name: string; count: number }[]; // name = channel name
  total: number;
}

interface WorkspaceContextValue extends WorkspacePresenceContextValue, WorkspacePanelsContextValue {
  // Decorator mode
  furnitureItems: FurnitureItem[];
  selectedCatalogItem: FurnitureCatalogEntry | null;
  setSelectedCatalogItem: (item: FurnitureCatalogEntry | null) => void;
  moveMode: boolean;
  setMoveMode: (mode: boolean) => void;
  eraseMode: boolean;
  setEraseMode: (mode: boolean) => void;
  // Furniture actions (emit + record for undo)
  placeFurniture: (roomId: string, catalogId: string, col: number, row: number, w: number, h: number, x: number, y: number, depth: number, flip: boolean) => void;
  moveFurniture: (id: string, x: number, y: number) => void;
  removeFurniture: (id: string) => void;
  transformFurniture: (id: string, flip: boolean) => void;
  changeFurnitureDepth: (id: string, depth: number) => void;
  undoFurniture: () => void;
  canUndoFurniture: boolean;
  workspaceAssets: WorkspaceAsset[];
  workspaceAssetsError: string;
  canManageWorkspaceAssets: boolean;
  uploadWorkspaceAsset: (payload: WorkspaceAssetCreatePayload) => Promise<{ ok: boolean; error?: string }>;
  removeWorkspaceAsset: (id: string) => Promise<{ ok: boolean; error?: string }>;
  // Members roster panel (mutually exclusive with the other side-rail panels)
  // Map templates (Phase 1: personal save/load, non-destructive)
  mapTemplates: MapTemplateDTO[];
  loadMapTemplates: () => Promise<void>;
  saveMapTemplate: (name: string) => Promise<MapTemplateDTO | null>;
  generateMapTemplate: () => Promise<MapTemplateDTO | null>;
  applyMapTemplate: (id: string) => Promise<void>;
  deleteMapTemplate: (id: string) => Promise<void>;
  exportMapTemplate: (id: string) => Promise<void>;
  importMapTemplate: (fileText: string) => Promise<MapTemplateDTO | null>;
  // Community gallery (Phase 2)
  publicMaps: MapTemplateDTO[];
  loadPublicMaps: () => Promise<void>;
  setMapPublic: (id: string, isPublic: boolean) => Promise<void>;
  copyPublicMap: (id: string) => Promise<MapTemplateDTO | null>;
  collisionMode: boolean;
  setCollisionMode: (mode: boolean) => void;
  // Messaging (persistent channels + DMs)
  channels: ChannelDTO[];
  dms: DmDTO[];
  activeChannelId: string | null;
  setActiveChannel: (id: string | null) => void;
  messagesByChannel: Record<string, MessageDTO[]>;
  hasMoreByChannel: Record<string, boolean>;
  unreadByChannel: Record<string, number>;
  // "While you were away": DMs + @mentions unread at the moment you (re)opened the
  // workspace. Null once there was nothing to show, or after the user dismisses it.
  awayNotice: AwayNotice | null;
  dismissAwayNotice: () => void;
  sendMessage: (channelId: string, body: string, image?: string) => Promise<void>;
  createChannel: (name: string) => Promise<ChannelDTO | null>;
  openDm: (userId: string) => Promise<string | null>;
  loadMore: (channelId: string) => Promise<void>;
  editMessage: (messageId: string, body: string) => void;
  deleteMessage: (messageId: string) => void;
  toggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
  // Reaction emotes
  sendEmote: (key: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const PAGE_SIZE = 50;
const UNDO_LIMIT = 50; // cap the furniture history to keep memory bounded
// Conversations whose loaded history we keep in memory. A long session that
// visits many channels would otherwise hold every message it ever fetched until
// the tab is closed; the least-recently-opened ones are dropped and re-fetched
// on demand. (Individual channels aren't trimmed: now that images are URLs
// rather than inline base64, a page of messages is a few KB of text.)
const MAX_CACHED_CHANNELS = 8;
const MAP_APPLY_TIMEOUT_MS = 15_000;

// Fold a freshly fetched page into whatever we already hold for that channel.
// Messages can arrive over the socket *before* the history is loaded, so a plain
// overwrite would drop them; dedup by id and re-sort chronologically instead.
function mergeMessages(existing: MessageDTO[] | undefined, incoming: MessageDTO[]): MessageDTO[] {
  if (!existing?.length) return incoming;
  const incomingIds = new Set(incoming.map((m) => m.id));
  const merged = [...incoming, ...existing.filter((m) => !incomingIds.has(m.id))];
  // createdAt is an ISO string, so lexicographic order is chronological order.
  return merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

function handleFurnitureAck(result: FurnitureCommandAck): void {
  if (!result.ok) console.warn('[furniture] command rejected:', result.error);
}

// One reversible furniture action by the local user (newest is undone first).
type FurnitureUndo =
  | { type: 'place'; id: string } // undo → remove that item
  | { type: 'remove'; item: FurnitureItem } // undo → re-place it
  | { type: 'move'; id: string; x: number; y: number } // undo → move back
  | { type: 'transform'; id: string; flip: boolean } // undo → restore orientation
  | { type: 'depth'; id: string; depth: number }; // undo → restore stacking plane

// Fire a browser notification for a DM / mention (no-op without permission).
function notify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body: body.slice(0, 140) });
  } catch {
    /* ignore */
  }
}

export function WorkspaceProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const user = useAuthStore((s) => s.user);

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [statusByUserId, setStatusByUserId] = useState<Record<string, string>>({});
  const [dndByUserId, setDndByUserId] = useState<Record<string, boolean>>({});
  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null);
  const [desksByUser, setDesksByUser] = useState<Record<string, { x: number; y: number }>>({});

  // Decorator state
  const [decoratorMode, setDecoratorModeRaw] = useState(false);
  const [furnitureItems, setFurnitureItems] = useState<FurnitureItem[]>([]);
  const [workspaceAssets, setWorkspaceAssets] = useState<WorkspaceAsset[]>([]);
  const [workspaceAssetsError, setWorkspaceAssetsError] = useState('');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<FurnitureCatalogEntry | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [collisionMode, setCollisionMode] = useState(false);
  const [mapTemplates, setMapTemplates] = useState<MapTemplateDTO[]>([]);
  const [publicMaps, setPublicMaps] = useState<MapTemplateDTO[]>([]);
  const [mapsOpen, setMapsOpenRaw] = useState(false);

  // Messaging state
  const [messagingOpen, setMessagingOpenRaw] = useState(false);

  // The side-rail panels are mutually exclusive: opening one (members, maps,
  // decorate, messaging) closes the others, so the workspace never shows two
  // competing panels at once. Members starts open as the default view.
  const [membersOpen, setMembersOpenRaw] = useState(true);
  const setMembersOpen = useCallback((open: boolean) => {
    if (open) { setMapsOpenRaw(false); setDecoratorModeRaw(false); setMessagingOpenRaw(false); }
    setMembersOpenRaw(open);
  }, []);
  const setMapsOpen = useCallback((open: boolean) => {
    if (open) { setMembersOpenRaw(false); setDecoratorModeRaw(false); setMessagingOpenRaw(false); }
    setMapsOpenRaw(open);
  }, []);
  const setDecoratorMode = useCallback((open: boolean) => {
    if (open) { setMembersOpenRaw(false); setMapsOpenRaw(false); setMessagingOpenRaw(false); }
    setDecoratorModeRaw(open);
  }, []);
  const setMessagingOpen = useCallback((open: boolean) => {
    if (open) { setMembersOpenRaw(false); setMapsOpenRaw(false); setDecoratorModeRaw(false); }
    setMessagingOpenRaw(open);
  }, []);
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [dms, setDms] = useState<DmDTO[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, MessageDTO[]>>({});
  const [hasMoreByChannel, setHasMoreByChannel] = useState<Record<string, boolean>>({});
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [awayNotice, setAwayNotice] = useState<AwayNotice | null>(null);
  // Build the away summary once, on the first channel load of the page session —
  // i.e. "what piled up while the app was closed". It deliberately does NOT
  // re-arm on a later in-session reconnect; that's a separate (future) case.
  const awayBuiltRef = useRef(false);

  // Refs so the socket listener (set up once) sees fresh values.
  const activeChannelIdRef = useRef<string | null>(null);
  activeChannelIdRef.current = activeChannelId;
  const messagingOpenRef = useRef(messagingOpen);
  messagingOpenRef.current = messagingOpen;
  const knownChannelIdsRef = useRef<Set<string>>(new Set());
  knownChannelIdsRef.current = new Set([...channels.map((c) => c.id), ...dms.map((d) => d.id)]);
  const dmIdsRef = useRef<Set<string>>(new Set());
  dmIdsRef.current = new Set(dms.map((d) => d.id));
  // Conversations whose history has actually been fetched, most-recently-opened
  // first. Drives both the "do I need to load?" check and the memory cap.
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const channelLruRef = useRef<string[]>([]);
  const myNameRef = useRef(user?.name ?? '');
  myNameRef.current = user?.name ?? '';
  const userIdRef = useRef(user?.id ?? '');
  userIdRef.current = user?.id ?? '';
  const accessRevokedRef = useRef(false);

  useEffect(() => {
    accessRevokedRef.current = false;
  }, [slug]);

  // Furniture undo: a stack of the local user's reversible actions. A fresh ref
  // to the list lets the action helpers read current state without stale closures.
  const furnitureItemsRef = useRef<FurnitureItem[]>([]);
  furnitureItemsRef.current = furnitureItems;
  const assetObjectUrlsRef = useRef<Map<string, string>>(new Map());
  const undoStackRef = useRef<FurnitureUndo[]>([]);
  const [canUndoFurniture, setCanUndoFurniture] = useState(false);

  // ── Workspace fetch ──
  const fetchWorkspace = useCallback(async (force = false) => {
    try {
      const data = await cachedFetch(
        `workspace:${slug}`,
        async () => (await api.get(`/workspaces/${slug}`)).data,
        { force },
      );
      setWorkspace(data.workspace);
    } catch (err: unknown) {
      const apiError = isAxiosError<{ error?: string }>(err) ? err.response?.data?.error : undefined;
      setError(apiError || "Impossible de charger l'espace");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // An explicit refetch must actually hit the network, never the cache.
  const refetchWorkspace = useCallback(() => fetchWorkspace(true), [fetchWorkspace]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  // Seed claimed desks from the loaded membership records.
  useEffect(() => {
    if (!workspace) return;
    const seed: Record<string, { x: number; y: number }> = {};
    workspace.members.forEach((m) => {
      if (m.deskX != null && m.deskY != null) seed[m.userId] = { x: m.deskX, y: m.deskY };
    });
    setDesksByUser(seed);
  }, [workspace]);

  // Fetch furniture after workspace loads. Cached: this effect re-runs whenever
  // the workspace object changes identity, and live edits arrive over the socket
  // anyway — so a second fetch would only re-download what we already have.
  useEffect(() => {
    if (!workspace) return;
    cachedFetch(`furniture:${slug}`, async () => (await api.get(`/furniture/${slug}`)).data)
      .then((data) => setFurnitureItems(data.furniture))
      .catch(() => {});
  }, [workspace, slug]);

  const loadWorkspaceAssets = useCallback(async () => {
    try {
      const { data } = await api.get(`/assets/${slug}`) as { data: { assets: WorkspaceAssetDTO[] } };
      const incomingIds = new Set(data.assets.map((asset) => asset.id));
      for (const [id, objectUrl] of assetObjectUrlsRef.current) {
        if (incomingIds.has(id)) continue;
        URL.revokeObjectURL(objectUrl);
        assetObjectUrlsRef.current.delete(id);
      }
      const hydrated = await Promise.all(data.assets.map(async (asset): Promise<WorkspaceAsset> => {
        const existingUrl = assetObjectUrlsRef.current.get(asset.id);
        if (existingUrl) return { ...asset, objectUrl: existingUrl };
        const response = await api.get<Blob>(asset.fileUrl, { responseType: 'blob' });
        const objectUrl = URL.createObjectURL(response.data);
        assetObjectUrlsRef.current.set(asset.id, objectUrl);
        return { ...asset, objectUrl };
      }));
      setWorkspaceAssets(hydrated);
      setWorkspaceAssetsError('');
    } catch {
      setWorkspaceAssetsError("Impossible de charger la bibliothèque privée");
    }
  }, [slug]);

  useEffect(() => {
    if (!workspace) return;
    void loadWorkspaceAssets();
  }, [workspace, loadWorkspaceAssets]);

  useEffect(() => () => {
    for (const objectUrl of assetObjectUrlsRef.current.values()) URL.revokeObjectURL(objectUrl);
    assetObjectUrlsRef.current.clear();
  }, []);

  const uploadWorkspaceAsset = useCallback(async (payload: WorkspaceAssetCreatePayload) => {
    try {
      await api.post(`/assets/${slug}`, payload);
      await loadWorkspaceAssets();
      return { ok: true };
    } catch (error: unknown) {
      const message = isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error
        : undefined;
      return { ok: false, error: message ?? "L'asset n'a pas pu être importé" };
    }
  }, [slug, loadWorkspaceAssets]);

  const removeWorkspaceAsset = useCallback(async (id: string) => {
    try {
      await api.delete(`/assets/${slug}/${id}`);
      await loadWorkspaceAssets();
      return { ok: true };
    } catch (error: unknown) {
      const message = isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error
        : undefined;
      return { ok: false, error: message ?? "L'asset n'a pas pu être supprimé" };
    }
  }, [slug, loadWorkspaceAssets]);

  // ── Messaging: load channel/DM list + restore unread from localStorage ──
  // Never served from the freshness window: this payload carries unread counts,
  // and replaying a stale snapshot would resurrect badges on conversations you
  // just read. `force` still joins an in-flight request, which is the part we
  // want here — a burst of messages from unknown channels triggers one fetch.
  const loadChannels = useCallback(async () => {
    try {
      const data = await cachedFetch(
        `channels:${slug}`,
        async () => (await api.get(`/channels/${slug}`)).data,
        { force: true },
      );
      setChannels(data.channels);
      setDms(data.dms);
      // Seed unread from the server (authoritative, multi-device).
      const u: Record<string, number> = {};
      [...data.channels, ...data.dms].forEach((c: ChannelDTO | DmDTO) => { u[c.id] = c.unread ?? 0; });
      setUnreadByChannel(u);

      // First load of the session → surface what piled up while you were away:
      // unread DMs + channel messages that @-mention you.
      if (!awayBuiltRef.current) {
        awayBuiltRef.current = true;
        const dmsMissed = (data.dms as DmDTO[])
          .filter((d) => (d.unread ?? 0) > 0)
          .map((d) => ({ id: d.id, name: d.otherUser?.name ?? 'Quelqu’un', count: d.unread }));
        const mentionsMissed = (data.channels as ChannelDTO[])
          .filter((c) => (c.unreadMentions ?? 0) > 0)
          .map((c) => ({ id: c.id, name: c.name, count: c.unreadMentions ?? 0 }));
        const total =
          dmsMissed.reduce((a, b) => a + b.count, 0) + mentionsMissed.reduce((a, b) => a + b.count, 0);
        if (total > 0) setAwayNotice({ dms: dmsMissed, mentions: mentionsMissed, total });
      }
    } catch {
      /* non-fatal */
    }
  }, [slug]);

  useEffect(() => {
    if (workspace) loadChannels();
  }, [workspace, loadChannels]);

  // Ask once for notification permission (DM / @mention alerts).
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Reflect a channel's latest message in the list previews.
  const bumpLastMessage = useCallback((m: MessageDTO) => {
    const last = { id: m.id, body: m.body, createdAt: m.createdAt, user: m.user };
    setChannels((prev) => prev.map((c) => (c.id === m.channelId ? { ...c, lastMessage: last } : c)));
    setDms((prev) => prev.map((d) => (d.id === m.channelId ? { ...d, lastMessage: last } : d)));
  }, []);

  // ── Socket connection + listeners ──
  useEffect(() => {
    if (!user) return;

    const sock = getSocket();
    // The socket captured an access token when it was first created; after an
    // absence that token may have expired. Hand it the freshest one we have
    // before connecting, otherwise the handshake is rejected and presence stays
    // empty (everyone shows "Hors ligne") until the periodic refresh much later.
    sock.auth = { token: useAuthStore.getState().accessToken };
    // NB: connect() is deliberately called *after* every sock.on(...) below is
    // registered (see end of effect). The server replies to space:join with a
    // one-shot 'space:players' list; if we connected here, a fast handshake could
    // deliver that reply before our listener existed → onlineUserIds stayed empty
    // → the peer was never seen and the call never started ("on se voit une fois
    // sur deux"). Registering first makes catching the reply order-independent.

    // Recover from an expired/invalid token: refresh once, then reconnect with it.
    // Throttled (not a per-connect counter) so a token that expires right after a
    // successful handshake can't drive a refresh/reconnect loop — at most one
    // refresh per window, whatever the connect/auth-expired cadence.
    let recovering = false;
    let lastRecoverAt = 0;
    const RECOVER_THROTTLE_MS = 15_000;
    const recoverAuth = async () => {
      if (accessRevokedRef.current || recovering || Date.now() - lastRecoverAt < RECOVER_THROTTLE_MS) return;
      recovering = true;
      lastRecoverAt = Date.now();
      const token = await refreshAccessToken();
      recovering = false;
      if (token) {
        sock.auth = { token };
        sock.connect();
      }
      // A 401 makes the session anonymous; a network failure keeps credentials
      // in memory and exposes the unavailable state instead of logging out.
    };

    sock.on('connect', () => setConnected(true));
    sock.on('connect_error', (err: Error) => {
      // Only a token problem warrants a refresh; let socket.io retry network blips.
      if (/auth|token|jwt|unauthor/i.test(err?.message ?? '')) recoverAuth();
    });
    sock.on('auth:expired', recoverAuth);
    sock.on('disconnect', () => { setConnected(false); setOnlineUserIds([]); });
    sock.on('space:error', (err: { error: string }) => setError(err.error));
    sock.on('workspace:members-changed', () => { void refetchWorkspace(); });
    sock.on('workspace:access-revoked', () => {
      accessRevokedRef.current = true;
      setError('Ton accès à cet espace a été retiré.');
      setSocket(null);
      disconnectSocket();
    });

    // Presence
    sock.on('space:players', (players: SpacePlayerPayload[]) => {
      setOnlineUserIds(players.map((p) => p.userId));
      setStatusByUserId((prev) => {
        const next = { ...prev };
        players.forEach((p) => { next[p.userId] = p.status ?? 'ONLINE'; });
        return next;
      });
      setDndByUserId((prev) => {
        const next = { ...prev };
        players.forEach((p) => { next[p.userId] = !!p.dnd; });
        return next;
      });
    });
    sock.on('space:player-joined', (p: SpacePlayerPayload) => {
      setOnlineUserIds((prev) => (prev.includes(p.userId) ? prev : [...prev, p.userId]));
      setStatusByUserId((prev) => ({ ...prev, [p.userId]: p.status ?? 'ONLINE' }));
      setDndByUserId((prev) => ({ ...prev, [p.userId]: !!p.dnd }));
    });
    sock.on('space:player-left', (d: { userId: string }) => {
      setOnlineUserIds((prev) => prev.filter((id) => id !== d.userId));
      // Drop their status too, otherwise the sidebar keeps showing a stale state.
      setStatusByUserId((prev) => {
        if (!(d.userId in prev)) return prev;
        const next = { ...prev };
        delete next[d.userId];
        return next;
      });
      setDndByUserId((prev) => {
        if (!(d.userId in prev)) return prev;
        const next = { ...prev };
        delete next[d.userId];
        return next;
      });
    });
    sock.on('space:player-status', (d: { userId: string; status: string }) => {
      setStatusByUserId((prev) => ({ ...prev, [d.userId]: d.status }));
    });
    sock.on('space:player-dnd', (d: { userId: string; dnd: boolean }) => {
      setDndByUserId((prev) => ({ ...prev, [d.userId]: d.dnd }));
    });
    sock.on('space:desk', (d: { userId: string; x: number | null; y: number | null }) => {
      setDesksByUser((prev) => {
        const next = { ...prev };
        if (d.x == null || d.y == null) delete next[d.userId];
        else next[d.userId] = { x: d.x, y: d.y };
        return next;
      });
    });

    // Messaging: a new message in any channel/DM
    sock.on('message:new', ({ message }: MessageNewPayload) => {
      setMessagesByChannel((prev) => {
        const list = prev[message.channelId] ?? [];
        if (list.some((m) => m.id === message.id)) return prev; // dedup (echo / reconnect)
        return { ...prev, [message.channelId]: [...list, message] };
      });
      bumpLastMessage(message);

      const isActiveOpen = messagingOpenRef.current && activeChannelIdRef.current === message.channelId;
      const mine = message.userId === userIdRef.current;
      if (isActiveOpen) {
        sock.emit('message:read', { channelId: message.channelId }); // advance server cursor
      } else if (!mine) {
        setUnreadByChannel((prev) => ({ ...prev, [message.channelId]: (prev[message.channelId] ?? 0) + 1 }));
      }

      // Notify on a DM or an @mention when not actively watching it.
      const mentionsMe =
        !!myNameRef.current && message.body.toLowerCase().includes(`@${myNameRef.current.toLowerCase()}`);
      const isDm = dmIdsRef.current.has(message.channelId);
      if (!mine && (isDm || mentionsMe) && (!isActiveOpen || document.hidden)) {
        notify(`${message.user.name}${isDm ? '' : ' t’a mentionné'}`, message.body);
      }

      // A DM we didn't know about yet (someone messaged us first) → refresh list.
      if (!knownChannelIdsRef.current.has(message.channelId)) loadChannels();
    });

    // A channel created by someone else
    sock.on('channel:created', ({ channel }: ChannelCreatedPayload) => {
      setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
    });

    // Edit / delete / reactions on an existing message
    sock.on('message:edited', ({ messageId, channelId, body, editedAt }: MessageEditedPayload) => {
      setMessagesByChannel((prev) => {
        const list = prev[channelId];
        if (!list) return prev;
        return { ...prev, [channelId]: list.map((m) => (m.id === messageId ? { ...m, body, editedAt } : m)) };
      });
    });
    sock.on('message:deleted', ({ messageId, channelId }: MessageDeletedPayload) => {
      setMessagesByChannel((prev) => {
        const list = prev[channelId];
        if (!list) return prev;
        return { ...prev, [channelId]: list.filter((m) => m.id !== messageId) };
      });
    });
    sock.on('reaction:update', ({ messageId, channelId, emoji, userId: uid, added }: ReactionUpdatePayload) => {
      setMessagesByChannel((prev) => {
        const list = prev[channelId];
        if (!list) return prev;
        return {
          ...prev,
          [channelId]: list.map((m) => {
            if (m.id !== messageId) return m;
            const has = m.reactions.some((r) => r.emoji === emoji && r.userId === uid);
            if (added && !has) return { ...m, reactions: [...m.reactions, { emoji, userId: uid }] };
            if (!added && has) return { ...m, reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.userId === uid)) };
            return m;
          }),
        };
      });
    });

    // Furniture real-time events
    sock.on('furniture:placed', (item: FurnitureItem) => {
      setFurnitureItems((prev) => [...prev.filter((f) => f.id !== item.id), item]);
      // Record my own placements for undo (the server assigns the id, so we can
      // only capture it here). A re-placement triggered by undoing a removal is
      // recorded too — so undoing again simply removes it (undoFurniture skips any
      // stack entry whose id no longer exists, so dead ids never cause a no-op).
      if (item.placedBy === userIdRef.current) {
        undoStackRef.current.push({ type: 'place', id: item.id });
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
        setCanUndoFurniture(true);
      }
    });
    // A whole-map replacement (applying a saved template): swap the full list and
    // drop the undo history — its ids no longer exist after the replace.
    sock.on('furniture:reset', (items: FurnitureItem[]) => {
      setFurnitureItems(items);
      undoStackRef.current = [];
      setCanUndoFurniture(false);
    });
    sock.on('furniture:moved', (data: FurnitureMovePayload) => {
      setFurnitureItems((prev) => prev.map((f) => (f.id === data.id ? { ...f, x: data.x, y: data.y } : f)));
    });
    sock.on('furniture:transformed', (data: FurnitureTransformPayload) => {
      setFurnitureItems((prev) =>
        prev.map((f) => (f.id === data.id ? { ...f, flip: data.flip } : f)),
      );
    });
    sock.on('furniture:depth', (data: FurnitureDepthPayload) => {
      setFurnitureItems((prev) => prev.map((f) => (f.id === data.id ? { ...f, depth: data.depth } : f)));
    });
    sock.on('furniture:removed', (data: FurnitureRemovePayload) => {
      setFurnitureItems((prev) => prev.filter((f) => f.id !== data.id));
    });
    sock.on('assets:changed', () => { void loadWorkspaceAssets(); });

    // All listeners are registered — now it's safe to open the connection.
    sock.connect();
    setSocket(sock);

    return () => {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
    };
    // Depend on user.id (stable), NOT the user object — changing the avatar
    // creates a new user object and would otherwise tear down the socket.
  }, [user?.id, slug, bumpLastMessage, loadChannels, loadWorkspaceAssets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactively refresh the access token before it expires and push it to the
  // socket, so the live session never lapses (the server enforces token expiry).
  useEffect(() => {
    if (!socket) return;
    const ms = Number(process.env.NEXT_PUBLIC_TOKEN_REFRESH_MS) || 13 * 60 * 1000;
    const id = setInterval(async () => {
      const token = await refreshAccessToken();
      if (token) {
        socket.auth = { token }; // used on future reconnects
        socket.emit('auth:refresh', { token }); // extend the current session in place
      }
    }, ms);
    return () => clearInterval(id);
  }, [socket]);

  // Recover the moment the tab regains focus / the network comes back. Browsers
  // throttle (or freeze) setInterval in a background tab, so the proactive timer
  // above can lapse while you're away → the access token (15 min) expires, the
  // server drops the socket (auth:expired) and HTTP calls 401. Nothing re-fired
  // when you returned, so messaging stayed dead until a manual reload ("plus
  // d'historique + plus écrire"). Here we act only when the socket is actually
  // down: refresh the token first (so the handshake passes), then reconnect —
  // SpaceScene re-emits space:join on 'connect', which also re-syncs presence.
  useEffect(() => {
    if (!socket) return;
    let busy = false;
    const recover = async () => {
      if (accessRevokedRef.current || busy || socket.connected) return; // healthy, revoked or already recovering → skip
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const token = await refreshAccessToken();
        if (!token) return; // anonymous or temporarily unavailable
        socket.auth = { token };
        socket.connect();
      } finally {
        busy = false;
      }
    };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);
    return () => {
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('focus', recover);
      window.removeEventListener('online', recover);
    };
  }, [socket]);

  // Leaving decorator mode clears the selected item and erase mode
  useEffect(() => {
    if (!decoratorMode) {
      setSelectedCatalogItem(null);
      setMoveMode(false);
      setEraseMode(false);
      setCollisionMode(false);
    }
  }, [decoratorMode]);

  // ── Messaging actions ──
  const fetchMessages = useCallback(
    async (channelId: string, before?: string) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (before) params.set('before', before);
      const { data } = await api.get(`/channels/${slug}/channels/${channelId}/messages?${params.toString()}`);
      return data as { messages: MessageDTO[]; hasMore: boolean };
    },
    [slug],
  );

  const setActiveChannel = useCallback(
    (id: string | null) => {
      setActiveChannelId(id);
      if (!id) return;
      // Marking read is owned by the effect below (keyed on the open + active
      // channel) so it also fires when you open the panel onto the already-active
      // conversation or reconnect under it — not just on an explicit click.

      // Most-recently-opened first; anything past the cap gets evicted below.
      channelLruRef.current = [id, ...channelLruRef.current.filter((c) => c !== id)];

      // Whether history was fetched is tracked separately from whether we hold
      // any messages: a live socket message can seed a channel we never opened,
      // and treating that single message as "already loaded" used to leave the
      // conversation permanently stuck showing just that one line.
      if (!historyLoadedRef.current.has(id)) {
        historyLoadedRef.current.add(id);
        fetchMessages(id)
          .then(({ messages, hasMore }) => {
            setMessagesByChannel((cur) => ({ ...cur, [id]: mergeMessages(cur[id], messages) }));
            setHasMoreByChannel((cur) => ({ ...cur, [id]: hasMore }));
          })
          // Forget the attempt so re-opening retries rather than showing a blank.
          .catch(() => historyLoadedRef.current.delete(id));
      }

      // Drop the least-recently-opened conversations from memory.
      const evicted = channelLruRef.current.slice(MAX_CACHED_CHANNELS);
      if (evicted.length === 0) return;
      channelLruRef.current = channelLruRef.current.slice(0, MAX_CACHED_CHANNELS);
      evicted.forEach((c) => historyLoadedRef.current.delete(c));
      const drop = <T,>(rec: Record<string, T>) => {
        const next = { ...rec };
        evicted.forEach((c) => delete next[c]);
        return next;
      };
      setMessagesByChannel(drop);
      setHasMoreByChannel(drop);
    },
    [fetchMessages],
  );

  // Whenever a conversation is actually visible (panel open + active), treat it
  // as read: clear its badge and advance the server read cursor. Re-runs when you
  // click another conversation, open the panel onto the already-active one, or the
  // socket reconnects under an open conversation — so the red dot never lingers on
  // a chat you're looking at.
  useEffect(() => {
    if (!messagingOpen || !activeChannelId) return;
    setUnreadByChannel((prev) => (prev[activeChannelId] ? { ...prev, [activeChannelId]: 0 } : prev));
    socket?.emit('message:read', { channelId: activeChannelId });
  }, [messagingOpen, activeChannelId, socket]);

  const editMessage = useCallback((messageId: string, body: string) => {
    const text = body.trim();
    if (text) socket?.emit('message:edit', { messageId, body: text });
  }, [socket]);

  const deleteMessage = useCallback((messageId: string) => {
    socket?.emit('message:delete', { messageId });
  }, [socket]);

  const toggleReaction = useCallback((messageId: string, emoji: string, mine: boolean) => {
    socket?.emit(mine ? 'reaction:remove' : 'reaction:add', { messageId, emoji });
  }, [socket]);

  const loadMore = useCallback(
    async (channelId: string) => {
      const list = messagesByChannel[channelId] ?? [];
      const oldest = list[0]?.id;
      if (!oldest) return;
      try {
        const { messages, hasMore } = await fetchMessages(channelId, oldest);
        setMessagesByChannel((cur) => {
          const existing = cur[channelId] ?? [];
          const seen = new Set(existing.map((m) => m.id));
          const merged = [...messages.filter((m) => !seen.has(m.id)), ...existing];
          return { ...cur, [channelId]: merged };
        });
        setHasMoreByChannel((cur) => ({ ...cur, [channelId]: hasMore }));
      } catch {
        /* ignore */
      }
    },
    [messagesByChannel, fetchMessages],
  );

  const sendMessage = useCallback(
    (channelId: string, body: string, image?: string): Promise<void> => {
      const text = body.trim();
      if (!text && !image) return Promise.resolve();
      if (!socket) return Promise.reject(new Error('Connexion indisponible.'));
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Délai d’envoi dépassé.')), 10_000);
        socket.emit('message:send', { channelId, body: text, ...(image ? { image } : {}) }, (ack: MessageSendAck) => {
          window.clearTimeout(timeout);
          if (ack.ok) resolve();
          else reject(new Error(ack.error));
        });
      });
    },
    [socket],
  );

  const createChannel = useCallback(
    async (name: string): Promise<ChannelDTO | null> => {
      const clean = name.trim();
      if (!clean) return null;
      try {
        const { data } = await api.post(`/channels/${slug}/channels`, { name: clean });
        setChannels((prev) => (prev.some((c) => c.id === data.channel.id) ? prev : [...prev, data.channel]));
        return data.channel as ChannelDTO;
      } catch {
        return null;
      }
    },
    [slug],
  );

  const openDm = useCallback(
    async (userId: string): Promise<string | null> => {
      try {
        const { data } = await api.post(`/channels/${slug}/dm`, { userId });
        const dm = data.channel as DmDTO;
        setDms((prev) => (prev.some((d) => d.id === dm.id) ? prev : [...prev, dm]));
        return dm.id;
      } catch {
        return null;
      }
    },
    [slug],
  );

  const sendEmote = useCallback((key: string) => {
    socket?.emit('space:emote', { emote: key });
  }, [socket]);

  const dismissAwayNotice = useCallback(() => setAwayNotice(null), []);

  // ── Map templates (Phase 1: personal save/load, non-destructive) ──
  // Cached: the panel calls this on every open and every tab switch, and the list
  // only changes through mutations we control (which invalidate it below).
  const loadMapTemplates = useCallback(async () => {
    try {
      const data = await cachedFetch(`maps:mine:${slug}`, async () => (await api.get(`/maps/${slug}`)).data);
      setMapTemplates(data.templates ?? []);
    } catch {
      /* non-fatal */
    }
  }, [slug]);

  const saveMapTemplate = useCallback(
    async (name: string, kind: 'user' | 'backup' = 'user'): Promise<MapTemplateDTO | null> => {
      const snapshot = {
        furniture: furnitureItemsRef.current.map((f) => ({
          catalogId: f.catalogId, col: f.col, row: f.row, w: f.w, h: f.h,
          x: f.x, y: f.y, depth: f.depth, flip: f.flip,
        })),
      };
      // Best-effort preview thumbnail (the scene exposes the capture hook).
      let preview: string | null = null;
      const capture = (window as unknown as { __nwCaptureMap?: (m?: number) => Promise<string | null> }).__nwCaptureMap;
      if (capture) {
        try { preview = await capture(360); } catch { preview = null; }
      }
      try {
        const { data } = await api.post(`/maps/${slug}`, {
          name: name.trim() || 'Sans titre', kind, preview, data: snapshot,
        });
        invalidate(`maps:mine:${slug}`);
        setMapTemplates((prev) => [data.template, ...prev]);
        return data.template as MapTemplateDTO;
      } catch {
        return null;
      }
    },
    [slug],
  );

  const generateMapTemplate = useCallback(async (): Promise<MapTemplateDTO | null> => {
    const room = workspace?.rooms?.[0];
    if (!room) return null;
    const snap = generateOfficeMap(room.posX, room.posY, room.width, room.height);
    const preview = schematicPreview(snap, room.width, room.height);
    try {
      const { data } = await api.post(`/maps/${slug}`, { name: 'Open-space généré', kind: 'user', preview, data: snap });
      invalidate(`maps:mine:${slug}`);
      setMapTemplates((prev) => [data.template, ...prev]);
      return data.template as MapTemplateDTO;
    } catch {
      return null;
    }
  }, [slug, workspace]);

  const applyMapTemplate = useCallback(
    async (id: string) => {
      await applyMapWithBackup({
        createBackup: async () => Boolean(await saveMapTemplate(
          `Sauvegarde auto — ${new Date().toLocaleString('fr-FR')}`,
          'backup',
        )),
        applyMap: async () => {
          if (!socket?.connected) {
            throw new Error('Connexion au serveur indisponible. La sauvegarde a bien été créée.');
          }

          const payload: MapApplyPayload = { templateId: id };
          return new Promise<MapApplyAck>((resolve, reject) => {
            socket.timeout(MAP_APPLY_TIMEOUT_MS).emit(
              'map:apply',
              payload,
              (timeoutError: Error | null, result: MapApplyAck) => {
                if (timeoutError) {
                  reject(new Error('Le serveur met trop de temps à répondre. Vérifie le décor avant de réessayer.'));
                  return;
                }
                resolve(result);
              },
            );
          });
        },
      });
    },
    [saveMapTemplate, socket],
  );

  const deleteMapTemplate = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/maps/${slug}/${id}`);
        invalidate(`maps:mine:${slug}`);
        invalidate('maps:public'); // it may have been published
        setMapTemplates((prev) => prev.filter((t) => t.id !== id));
      } catch {
        /* ignore */
      }
    },
    [slug],
  );

  // Download a template (with its full snapshot) as a portable .json file — for
  // archiving your maps or sending them to someone else.
  const exportMapTemplate = useCallback(
    async (id: string) => {
      try {
        const { data } = await api.get(`/maps/${slug}/${id}`);
        const t = data.template as { name: string; preview: string | null; data: unknown };
        const file = { nestwork: 'map', version: 1, name: t.name, preview: t.preview ?? null, data: t.data };
        const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(t.name || 'carte').replace(/[^\w\- ]+/g, '_').slice(0, 60)}.nestwork-map.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    },
    [slug],
  );

  // Import a .json map file into my library (the server re-validates the snapshot,
  // so a malformed/tampered file is rejected). Returns null on failure.
  const importMapTemplate = useCallback(
    async (fileText: string): Promise<MapTemplateDTO | null> => {
      let parsed: { nestwork?: string; name?: string; preview?: unknown; data?: unknown };
      try {
        parsed = JSON.parse(fileText);
      } catch {
        return null;
      }
      if (!parsed || parsed.nestwork !== 'map' || typeof parsed.data !== 'object' || parsed.data === null) return null;
      try {
        const { data } = await api.post(`/maps/${slug}`, {
          name: (typeof parsed.name === 'string' && parsed.name.trim()) || 'Carte importée',
          kind: 'user',
          preview: typeof parsed.preview === 'string' ? parsed.preview : null,
          data: parsed.data,
        });
        invalidate(`maps:mine:${slug}`);
        setMapTemplates((prev) => [data.template, ...prev]);
        return data.template as MapTemplateDTO;
      } catch {
        return null;
      }
    },
    [slug],
  );

  // ── Community gallery (Phase 2) ──
  const loadPublicMaps = useCallback(async () => {
    try {
      const data = await cachedFetch('maps:public', async () => (await api.get(`/maps/public`)).data);
      setPublicMaps(data.templates ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  const setMapPublic = useCallback(
    async (id: string, isPublic: boolean) => {
      // Optimistic toggle, reverted on failure.
      setMapTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, isPublic } : t)));
      try {
        await api.patch(`/maps/${slug}/${id}`, { isPublic });
        invalidate(`maps:mine:${slug}`);
        invalidate('maps:public'); // the gallery just gained or lost this map
      } catch {
        setMapTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, isPublic: !isPublic } : t)));
      }
    },
    [slug],
  );

  const copyPublicMap = useCallback(
    async (id: string): Promise<MapTemplateDTO | null> => {
      try {
        const { data } = await api.post(`/maps/${slug}/use/${id}`);
        invalidate(`maps:mine:${slug}`);
        setMapTemplates((prev) => [data.template, ...prev]);
        return data.template as MapTemplateDTO;
      } catch {
        return null;
      }
    },
    [slug],
  );

  // ── Furniture actions (emit + record for undo) ──
  const pushUndo = useCallback((action: FurnitureUndo) => {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    setCanUndoFurniture(true);
  }, []);

  const placeFurniture = useCallback(
    (roomId: string, catalogId: string, col: number, row: number, w: number, h: number, x: number, y: number, depth: number, flip: boolean) => {
      // Recorded for undo on the 'furniture:placed' echo (the id is server-assigned).
      const payload: FurniturePlacePayload = { roomId, catalogId, col, row, w, h, x, y, depth, flip };
      socket?.emit('furniture:place', payload, handleFurnitureAck);
    },
    [socket],
  );

  const moveFurniture = useCallback(
    (id: string, x: number, y: number) => {
      const prev = furnitureItemsRef.current.find((f) => f.id === id);
      if (prev) pushUndo({ type: 'move', id, x: prev.x, y: prev.y });
      const payload: FurnitureMovePayload = { id, x, y };
      socket?.emit('furniture:move', payload, handleFurnitureAck);
    },
    [socket, pushUndo],
  );

  const transformFurniture = useCallback(
    (id: string, flip: boolean) => {
      const prev = furnitureItemsRef.current.find((f) => f.id === id);
      if (prev) pushUndo({ type: 'transform', id, flip: prev.flip });
      const payload: FurnitureTransformPayload = { id, flip };
      socket?.emit('furniture:transform', payload, handleFurnitureAck);
    },
    [socket, pushUndo],
  );

  const removeFurniture = useCallback(
    (id: string) => {
      const item = furnitureItemsRef.current.find((f) => f.id === id);
      if (item) pushUndo({ type: 'remove', item });
      const payload: FurnitureRemovePayload = { id };
      socket?.emit('furniture:remove', payload, handleFurnitureAck);
    },
    [socket, pushUndo],
  );

  const changeFurnitureDepth = useCallback(
    (id: string, depth: number) => {
      const prev = furnitureItemsRef.current.find((f) => f.id === id);
      if (prev && prev.depth !== depth) pushUndo({ type: 'depth', id, depth: prev.depth });
      // Keep Phaser responsive while the persisted socket echo is in flight.
      setFurnitureItems((items) => items.map((item) => (item.id === id ? { ...item, depth } : item)));
      const payload: FurnitureDepthPayload = { id, depth };
      socket?.emit('furniture:depth', payload, handleFurnitureAck);
    },
    [socket, pushUndo],
  );

  // Undo the local user's most recent furniture action by emitting its inverse.
  const undoFurniture = useCallback(() => {
    const exists = (id: string) => furnitureItemsRef.current.some((f) => f.id === id);
    // Pop until we find an action that still applies. After undoing a removal the
    // server re-places with a NEW id, leaving older entries that point at the old
    // (now-dead) id — skip those instead of emitting a silent no-op.
    let action: FurnitureUndo | undefined;
    while ((action = undoStackRef.current.pop())) {
      if (action.type === 'remove' || exists(action.id)) break;
    }
    setCanUndoFurniture(undoStackRef.current.length > 0);
    if (!action || !socket) return;
    switch (action.type) {
      case 'place':
        socket.emit('furniture:remove', { id: action.id } satisfies FurnitureRemovePayload, handleFurnitureAck);
        break;
      case 'remove': {
        const it = action.item;
        socket.emit('furniture:place', {
          roomId: it.roomId, catalogId: it.catalogId, col: it.col, row: it.row,
          w: it.w, h: it.h, x: it.x, y: it.y, depth: it.depth, flip: it.flip,
        } satisfies FurniturePlacePayload, handleFurnitureAck);
        break;
      }
      case 'move':
        socket.emit('furniture:move', { id: action.id, x: action.x, y: action.y } satisfies FurnitureMovePayload, handleFurnitureAck);
        break;
      case 'transform':
        socket.emit('furniture:transform', { id: action.id, flip: action.flip } satisfies FurnitureTransformPayload, handleFurnitureAck);
        break;
      case 'depth':
        setFurnitureItems((items) => items.map((item) => (
          item.id === action.id ? { ...item, depth: action.depth } : item
        )));
        socket.emit('furniture:depth', { id: action.id, depth: action.depth } satisfies FurnitureDepthPayload, handleFurnitureAck);
        break;
    }
  }, [socket]);

  const setMyStatus = useCallback((status: string) => {
    if (!user) return;
    setStatusByUserId((prev) => ({ ...prev, [user.id]: status })); // optimistic
    socket?.emit('space:set-status', { status });
  }, [socket, user]);

  const setMyDnd = useCallback((dnd: boolean) => {
    if (!user) return;
    setDndByUserId((prev) => ({ ...prev, [user.id]: dnd })); // optimistic
    socket?.emit('space:set-dnd', { dnd });
  }, [socket, user]);

  // Teleport next to a member (handled inside the Phaser scene).
  const goToUser = useCallback((userId: string) => {
    (window as unknown as { __nwGoTo?: (id: string) => void }).__nwGoTo?.(userId);
  }, []);

  // Ask the server for the authoritative presence list (recovers from a missed
  // join/leave event). The server replies with a fresh 'space:players'.
  const refreshPresence = useCallback(() => {
    socket?.emit('space:refresh-presence');
  }, [socket]);

  // Claim the avatar's current spot as "my desk" (persisted spawn). Reads the
  // live position from the scene hook; optimistic local update.
  const claimDesk = useCallback(() => {
    const players = (window as unknown as { __nwGetPlayers?: () => Array<{ x: number; y: number; self: boolean }> }).__nwGetPlayers?.();
    const me = players?.find((p) => p.self);
    if (!me || !user) return;
    const pos = { x: Math.round(me.x), y: Math.round(me.y) };
    setDesksByUser((prev) => ({ ...prev, [user.id]: pos }));
    socket?.emit('desk:claim', pos);
  }, [socket, user]);

  const clearDesk = useCallback(() => {
    if (user) {
      setDesksByUser((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
    }
    socket?.emit('desk:clear');
  }, [socket, user]);

  // Seed our own status from the persisted user record.
  useEffect(() => {
    if (user) setStatusByUserId((prev) => (prev[user.id] ? prev : { ...prev, [user.id]: user.status || 'ONLINE' }));
  }, [user]);

  const totalUnread = useMemo(
    () => Object.values(unreadByChannel).reduce((a, b) => a + b, 0),
    [unreadByChannel],
  );

  const memberList = useMemo(() => workspace?.members || [], [workspace]);
  const roomList = useMemo(() => workspace?.rooms || [], [workspace]);
  // Memoised so consumers of useWorkspace() don't re-render on every provider
  // render (presence/status/move updates) just because these got new identities.
  const desks: Desk[] = useMemo(
    () =>
      Object.entries(desksByUser).map(([userId, pos]) => ({
        userId,
        x: pos.x,
        y: pos.y,
        name: memberList.find((m) => m.userId === userId)?.user.name ?? '',
      })),
    [desksByUser, memberList],
  );
  // Prefer the live (claimed-this-session) desk, else fall back to the persisted
  // membership record — which is available synchronously at first render, so the
  // scene can spawn at the desk on mount (the desksByUser seed runs in an effect,
  // i.e. one render too late for spawn).
  const myDesk = useMemo(() => {
    if (!user) return null;
    if (desksByUser[user.id]) return desksByUser[user.id];
    const m = memberList.find((mm) => mm.userId === user.id);
    return m?.deskX != null && m?.deskY != null ? { x: m.deskX, y: m.deskY } : null;
  }, [desksByUser, memberList, user]);

  // Teleport straight to my own desk (handled inside the Phaser scene).
  const goToMyDesk = useCallback(() => {
    if (!myDesk) return;
    (window as unknown as { __nwMoveTo?: (x: number, y: number) => void }).__nwMoveTo?.(myDesk.x, myDesk.y);
  }, [myDesk]);

  const presenceValue = useMemo<WorkspacePresenceContextValue>(() => ({
    slug,
    workspace,
    members: memberList,
    rooms: roomList,
    socket,
    connected,
    onlineUserIds,
    statusByUserId,
    setMyStatus,
    dndByUserId,
    setMyDnd,
    goToUser,
    goToMyDesk,
    refreshPresence,
    desks,
    myDesk,
    claimDesk,
    clearDesk,
    loading,
    error,
    currentRoomName,
    setCurrentRoomName,
    refetchWorkspace,
  }), [
    slug,
    workspace,
    memberList,
    roomList,
    socket,
    connected,
    onlineUserIds,
    statusByUserId,
    setMyStatus,
    dndByUserId,
    setMyDnd,
    goToUser,
    goToMyDesk,
    refreshPresence,
    desks,
    myDesk,
    claimDesk,
    clearDesk,
    loading,
    error,
    currentRoomName,
    refetchWorkspace,
  ]);

  const panelsValue = useMemo<WorkspacePanelsContextValue>(() => ({
    membersOpen,
    setMembersOpen,
    mapsOpen,
    setMapsOpen,
    decoratorMode,
    setDecoratorMode,
    messagingOpen,
    setMessagingOpen,
    totalUnread,
  }), [
    membersOpen,
    setMembersOpen,
    mapsOpen,
    setMapsOpen,
    decoratorMode,
    setDecoratorMode,
    messagingOpen,
    setMessagingOpen,
    totalUnread,
  ]);

  const canManageWorkspaceAssets = useMemo(() => {
    const role = workspace?.members.find((member) => member.userId === user?.id)?.role;
    return role === 'OWNER' || role === 'ADMIN';
  }, [workspace, user?.id]);

  // Compatibility facade for consumers that genuinely span several domains.
  // New focused consumers should prefer one of the narrower hooks below.
  const value = useMemo<WorkspaceContextValue>(() => ({
    ...presenceValue,
    ...panelsValue,
    furnitureItems,
    selectedCatalogItem,
    setSelectedCatalogItem,
    moveMode,
    setMoveMode,
    eraseMode,
    setEraseMode,
    placeFurniture,
    moveFurniture,
    removeFurniture,
    transformFurniture,
    changeFurnitureDepth,
    undoFurniture,
    canUndoFurniture,
    workspaceAssets,
    workspaceAssetsError,
    canManageWorkspaceAssets,
    uploadWorkspaceAsset,
    removeWorkspaceAsset,
    mapTemplates,
    loadMapTemplates,
    saveMapTemplate,
    generateMapTemplate,
    applyMapTemplate,
    deleteMapTemplate,
    exportMapTemplate,
    importMapTemplate,
    publicMaps,
    loadPublicMaps,
    setMapPublic,
    copyPublicMap,
    collisionMode,
    setCollisionMode,
    channels,
    dms,
    activeChannelId,
    setActiveChannel,
    messagesByChannel,
    hasMoreByChannel,
    unreadByChannel,
    awayNotice,
    dismissAwayNotice,
    sendMessage,
    createChannel,
    openDm,
    loadMore,
    editMessage,
    deleteMessage,
    toggleReaction,
    sendEmote,
  }), [
    presenceValue,
    panelsValue,
    furnitureItems,
    selectedCatalogItem,
    moveMode,
    eraseMode,
    placeFurniture,
    moveFurniture,
    removeFurniture,
    transformFurniture,
    changeFurnitureDepth,
    undoFurniture,
    canUndoFurniture,
    workspaceAssets,
    workspaceAssetsError,
    canManageWorkspaceAssets,
    uploadWorkspaceAsset,
    removeWorkspaceAsset,
    mapTemplates,
    loadMapTemplates,
    saveMapTemplate,
    generateMapTemplate,
    applyMapTemplate,
    deleteMapTemplate,
    exportMapTemplate,
    importMapTemplate,
    publicMaps,
    loadPublicMaps,
    setMapPublic,
    copyPublicMap,
    collisionMode,
    channels,
    dms,
    activeChannelId,
    setActiveChannel,
    messagesByChannel,
    hasMoreByChannel,
    unreadByChannel,
    awayNotice,
    dismissAwayNotice,
    sendMessage,
    createChannel,
    openDm,
    loadMore,
    editMessage,
    deleteMessage,
    toggleReaction,
    sendEmote,
  ]);

  return (
    <WorkspaceDomainProviders presence={presenceValue} panels={panelsValue}>
      <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    </WorkspaceDomainProviders>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
