// NestWork shared types
// These types are shared between the web and server apps

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: UserStatus;
}

export enum UserStatus {
  ONLINE = 'ONLINE',
  BUSY = 'BUSY',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE',
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  details?: unknown;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: number;
}

export interface ReadinessResponse {
  status: 'ready' | 'unavailable';
  timestamp: number;
  checks: {
    database: 'ok' | 'unavailable';
  };
}

// One source of truth shared by the picker and the server-side skin validator.
export const ORIGINAL_CHARACTER_NAMES = ['Aurore', 'Milo', 'Leo'] as const;

// ─── Messaging ───────────────────────────────────────────
// Dates are serialized to ISO strings over JSON / socket.io.

export type ChannelType = 'CHANNEL' | 'DM';

export interface MessageUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ReactionDTO {
  emoji: string;
  userId: string;
}

export interface MessageDTO {
  id: string;
  channelId: string;
  userId: string;
  body: string;
  imageUrl?: string | null; // optional inline image (base64 data URL)
  createdAt: string;
  editedAt: string | null;
  user: MessageUser;
  reactions: ReactionDTO[];
}

export interface LastMessageDTO {
  id: string;
  body: string;
  createdAt: string;
  user: MessageUser;
}

export interface ChannelDTO {
  id: string;
  type: 'CHANNEL';
  name: string;
  createdAt: string;
  lastMessage: LastMessageDTO | null;
  unread: number;
  // Unread messages in this channel that @-mention the caller (subset of `unread`).
  unreadMentions?: number;
}

// A saved map template (list view — the heavy `data` snapshot stays server-side).
export interface MapTemplateDTO {
  id: string;
  name: string;
  kind: 'user' | 'backup';
  isPublic: boolean; // published to the community gallery
  preview: string | null; // base64 PNG/JPEG data URL thumbnail
  createdBy: string;
  createdAt: string;
  authorName?: string; // only set for community-gallery items
}

export interface MapApplyPayload {
  templateId: string;
}

export type MapApplyAck =
  | { ok: true }
  | { ok: false; error: string };

// ─── Furniture ───────────────────────────────────────────

// Floors/walls use 1–2, regular furniture 3–49, collision markers 50.
export const FURNITURE_DEPTH_MIN = 1;
export const FURNITURE_DEPTH_MAX = 50;

export interface FurnitureDTO {
  id: string;
  roomId: string;
  placedBy: string;
  catalogId: string;
  col: number;
  row: number;
  w: number;
  h: number;
  x: number;
  y: number;
  depth: number;
  flip: boolean;
}

export interface FurniturePlacePayload {
  roomId: string;
  catalogId: string;
  col: number;
  row: number;
  w: number;
  h: number;
  x: number;
  y: number;
  depth: number;
  flip: boolean;
}

export interface FurnitureMovePayload {
  id: string;
  x: number;
  y: number;
}

export interface FurnitureTransformPayload {
  id: string;
  flip: boolean;
}

export interface FurnitureRemovePayload {
  id: string;
}

export interface FurnitureDepthPayload {
  id: string;
  depth: number;
}

export type FurnitureCommandAck =
  | { ok: true }
  | { ok: false; error: string };

// ─── Presence / WebRTC signaling ─────────────────────────

export interface SpacePlayerPayload {
  userId: string;
  name: string;
  x: number;
  y: number;
  character: string | null;
  status: string;
  dnd: boolean;
  lockX: number;
  lockY: number;
}

export interface SpaceProximityPayload {
  userId: string;
  near: boolean;
}

export interface RtcSignalPayload {
  to: string;
  signal: unknown;
}

export interface RtcSignalMessage {
  from: string;
  signal: unknown;
}

export type MessageSendAck =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export interface DmDTO {
  id: string;
  type: 'DM';
  otherUser: MessageUser | null;
  lastMessage: LastMessageDTO | null;
  unread: number;
}

// Socket event payloads
export interface MessageSendPayload {
  channelId: string;
  body: string;
  image?: string; // optional base64 data URL
}
export interface MessageNewPayload {
  message: MessageDTO;
}
export interface ChannelCreatedPayload {
  channel: ChannelDTO;
}
export interface MessageEditedPayload {
  messageId: string;
  channelId: string;
  body: string;
  editedAt: string;
}
export interface MessageDeletedPayload {
  messageId: string;
  channelId: string;
}
export interface ReactionUpdatePayload {
  messageId: string;
  channelId: string;
  emoji: string;
  userId: string;
  added: boolean;
}
