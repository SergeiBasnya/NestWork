'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, FormEvent, Fragment } from 'react';
import { X, Send, Hash, Plus, MessageSquare, ChevronUp, SmilePlus, Pencil, Trash2, ImagePlus } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { imageSrc } from '../../lib/api';
import {
  formatMessageDateTime,
  formatMessageDay,
  formatMessageTime,
  messageDayKey,
} from '../../lib/messageDates';
import type { MessageDTO } from '@nestwork/shared';
import { Badge } from '../ui';

const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '🙏', '👀'];

export function MessagingPanel() {
  const user = useAuthStore((s) => s.user);
  const {
    messagingOpen,
    setMessagingOpen,
    channels,
    dms,
    members,
    activeChannelId,
    setActiveChannel,
    messagesByChannel,
    hasMoreByChannel,
    unreadByChannel,
    sendMessage,
    createChannel,
    openDm,
    loadMore,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useWorkspace();

  const memberNames = useMemo(() => members.map((m) => m.user.name), [members]);

  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null); // base64 data URL to send
  const [sendError, setSendError] = useState('');
  const [dragOver, setDragOver] = useState(false); // a file is being dragged over the conversation
  const [lightbox, setLightbox] = useState<string | null>(null); // image shown enlarged
  const [newChannel, setNewChannel] = useState<string | null>(null); // null = closed, '' = open empty
  const [pickingDm, setPickingDm] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef<string | null>(null);

  const messages = useMemo(
    () => (activeChannelId ? messagesByChannel[activeChannelId] ?? [] : []),
    [activeChannelId, messagesByChannel],
  );

  const activeTitle = useMemo(() => {
    if (!activeChannelId) return null;
    const ch = channels.find((c) => c.id === activeChannelId);
    if (ch) return { icon: 'hash' as const, label: ch.name };
    const dm = dms.find((d) => d.id === activeChannelId);
    if (dm) return { icon: 'dm' as const, label: dm.otherUser?.name ?? 'Conversation' };
    return null;
  }, [activeChannelId, channels, dms]);

  // Auto-scroll to bottom when the channel changes or a new message is appended
  // (not when older history is prepended — last id is unchanged then). useLayoutEffect
  // pins before paint (no flash), and we re-pin as images load: they grow the content
  // after layout, which would otherwise leave the view stuck above the latest messages.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId === lastIdRef.current) return;
    lastIdRef.current = lastId;

    const pin = () => { log.scrollTop = log.scrollHeight; };
    pin();
    const imgs = Array.from(log.querySelectorAll('img')).filter((img) => !img.complete);
    imgs.forEach((img) => img.addEventListener('load', pin, { once: true }));
    return () => imgs.forEach((img) => img.removeEventListener('load', pin));
  }, [messages, activeChannelId]);

  // Close the image lightbox with Escape.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (!messagingOpen) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingImage) || !activeChannelId) return;
    setSendError('');
    try {
      await sendMessage(activeChannelId, text, pendingImage ?? undefined);
      setDraft('');
      setPendingImage(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Impossible d’envoyer le message.');
    }
  }

  async function pickImage(file: File | null | undefined) {
    if (!file) return;
    const url = await downscaleToDataUrl(file).catch(() => null);
    if (url) setPendingImage(url);
    if (fileRef.current) fileRef.current.value = '';
  }

  function onDropImage(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!activeChannelId) return;
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) pickImage(file);
  }

  async function submitNewChannel(e: FormEvent) {
    e.preventDefault();
    const name = (newChannel ?? '').trim();
    if (!name) return;
    const ch = await createChannel(name);
    setNewChannel(null);
    if (ch) setActiveChannel(ch.id);
  }

  async function startDm(userId: string) {
    setPickingDm(false);
    const id = await openDm(userId);
    if (id) setActiveChannel(id);
  }

  const otherMembers = members.filter((m) => m.userId !== user?.id);

  return (
    <div className="absolute left-0 top-0 z-10 flex h-full w-[40rem] max-w-[90vw] border-r border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-xl">
      {/* ── Left column: channel + DM list ── */}
      <div className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Messagerie</span>
          <button
            onClick={() => setMessagingOpen(false)}
            title="Fermer"
            className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Channels */}
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Canaux</span>
            <button
              onClick={() => setNewChannel((v) => (v === null ? '' : null))}
              title="Créer un canal"
              className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
            >
              <Plus size={14} />
            </button>
          </div>
          {newChannel !== null && (
            <form onSubmit={submitNewChannel} className="px-1 pb-2">
              <input
                autoFocus
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                onBlur={() => setNewChannel((v) => (v && v.trim() ? v : null))}
                placeholder="nom du canal"
                maxLength={50}
                className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-honey"
              />
            </form>
          )}
          {channels.map((c) => (
            <ListItem
              key={c.id}
              active={c.id === activeChannelId}
              unread={unreadByChannel[c.id] ?? 0}
              onClick={() => setActiveChannel(c.id)}
              icon={<Hash size={14} className="shrink-0 opacity-70" />}
              label={c.name}
            />
          ))}

          {/* DMs */}
          <div className="mb-1 mt-3 flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Messages directs</span>
            <button
              onClick={() => setPickingDm((v) => !v)}
              title="Nouveau message direct"
              className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
            >
              <Plus size={14} />
            </button>
          </div>
          {pickingDm && (
            <div className="mb-1 px-1">
              {otherMembers.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]">Aucun autre membre</p>
              ) : (
                otherMembers.map((m) => (
                  <button
                    key={m.userId}
                    onClick={() => startDm(m.userId)}
                    className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
                  >
                    {m.user.name}
                  </button>
                ))
              )}
            </div>
          )}
          {dms.map((d) => (
            <ListItem
              key={d.id}
              active={d.id === activeChannelId}
              unread={unreadByChannel[d.id] ?? 0}
              unreadTone="red"
              onClick={() => setActiveChannel(d.id)}
              icon={<MessageSquare size={14} className="shrink-0 opacity-70" />}
              label={d.otherUser?.name ?? 'Conversation'}
            />
          ))}
        </div>
      </div>

      {/* ── Right column: active conversation ── */}
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (activeChannelId && [...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={onDropImage}
      >
        {dragOver && activeChannelId && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-honey bg-[var(--color-panel-bg)]/85">
            <div className="flex flex-col items-center gap-2 text-honey">
              <ImagePlus size={28} />
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Déposer l&apos;image ici</span>
            </div>
          </div>
        )}
        {!activeChannelId || !activeTitle ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--color-text-tertiary)]">
            Choisis un canal ou une conversation 💬
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              {activeTitle.icon === 'hash' ? <Hash size={16} className="opacity-70" /> : <MessageSquare size={16} className="opacity-70" />}
              <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{activeTitle.label}</span>
            </div>

            <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-3">
              {hasMoreByChannel[activeChannelId] && (
                <button
                  onClick={() => loadMore(activeChannelId)}
                  className="mx-auto flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)]"
                >
                  <ChevronUp size={12} /> Charger les messages précédents
                </button>
              )}
              {messages.length === 0 ? (
                <p className="mt-4 text-center text-xs text-[var(--color-text-tertiary)]">Aucun message pour l&apos;instant.</p>
              ) : (
                messages.map((m, index) => {
                  const previousMessage = messages[index - 1];
                  const startsNewDay = !previousMessage || messageDayKey(previousMessage.createdAt) !== messageDayKey(m.createdAt);

                  return (
                    <Fragment key={m.id}>
                      {startsNewDay && <MessageDaySeparator createdAt={m.createdAt} />}
                      <MessageRow
                        m={m}
                        me={m.userId === user?.id}
                        myId={user?.id ?? ''}
                        memberNames={memberNames}
                        onEdit={editMessage}
                        onDelete={deleteMessage}
                        onToggleReaction={toggleReaction}
                        onOpenImage={setLightbox}
                      />
                    </Fragment>
                  );
                })
              )}
            </div>

            <form onSubmit={submit} className="border-t border-[var(--color-border)] p-3">
              {sendError && <p role="alert" className="mb-2 text-xs text-red">{sendError}</p>}
              {pendingImage && (
                <div className="relative mb-2 inline-block">
                  <img src={pendingImage} alt="" className="max-h-28 rounded-lg border border-[var(--color-border)]" />
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    title="Retirer l'image"
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-hive-800 text-white shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Joindre une image"
                  aria-label="Joindre une image"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
                >
                  <ImagePlus size={18} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={(e) => {
                    const img = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
                    if (img) pickImage(img.getAsFile());
                  }}
                  placeholder={`Message ${activeTitle.icon === 'hash' ? '#' + activeTitle.label : 'à ' + activeTitle.label}…`}
                  maxLength={4000}
                  className="flex-1 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none focus:border-honey"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() && !pendingImage}
                  title="Envoyer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-honey text-hive-800 transition-colors hover:bg-honey-400 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            title="Fermer"
            aria-label="Fermer"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <img
            src={imageSrc(lightbox)}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}

// Read an image file and downscale it to a reasonably small base64 data URL so
// it fits the socket payload + DB (the server caps at ~3.5MB and validates type).
async function downscaleToDataUrl(file: File, max = 1280): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const dataUrl: string = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  // Small enough already → keep as-is (preserves PNG transparency / GIFs).
  if (scale === 1 && dataUrl.length < 600_000) return dataUrl;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  let out = c.toDataURL('image/webp', 0.85);
  if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.85); // Safari fallback
  return out;
}

// Render a message body, turning URLs into clickable links and highlighting
// @mentions of known members. URLs and mentions are matched in a single pass so
// they never overlap.
function renderBody(body: string, memberNames: string[]) {
  const escaped = memberNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const mentionAlt = escaped.length ? `|@(?:${escaped.join('|')})` : '';
  // A URL (http(s):// or bare www.) or, if any members are known, a mention.
  const re = new RegExp(`(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+${mentionAlt})`, 'gi');
  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > last) out.push(body.slice(last, match.index));
    const token = match[0];
    if (token[0] === '@') {
      out.push(
        <span className="rounded bg-honey/30 px-0.5 font-medium text-[var(--color-text-primary)]">{token}</span>,
      );
    } else {
      // Trailing punctuation usually belongs to the sentence, not the URL.
      const trail = token.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
      const url = trail ? token.slice(0, -trail.length) : token;
      const href = url.startsWith('www.') ? `https://${url}` : url;
      out.push(
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium underline underline-offset-2 hover:opacity-80"
        >
          {url}
        </a>,
      );
      if (trail) out.push(trail);
    }
    last = match.index + token.length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}

function MessageRow({
  m,
  me,
  myId,
  memberNames,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenImage,
}: {
  m: MessageDTO;
  me: boolean;
  myId: string;
  memberNames: string[];
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, emoji: string, mine: boolean) => void;
  onOpenImage: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(m.body);

  // Aggregate reactions: emoji → { count, mine }.
  const agg = new Map<string, { count: number; mine: boolean }>();
  for (const r of m.reactions) {
    const e = agg.get(r.emoji) ?? { count: 0, mine: false };
    e.count += 1;
    if (r.userId === myId) e.mine = true;
    agg.set(r.emoji, e);
  }

  function saveEdit() {
    const text = draft.trim();
    if (text && text !== m.body) onEdit(m.id, text);
    setEditing(false);
  }

  return (
    <div className={`group flex flex-col ${me ? 'items-end' : 'items-start'}`}>
      <div className="mb-0.5 flex items-baseline gap-2 px-1">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{me ? 'Vous' : m.user.name}</span>
        <time
          dateTime={m.createdAt}
          title={formatMessageDateTime(m.createdAt)}
          className="font-mono text-[10px] text-[var(--color-text-tertiary)]"
        >
          {formatMessageTime(m.createdAt)}
        </time>
        {m.editedAt && <span className="text-[10px] italic text-[var(--color-text-tertiary)]">modifié</span>}
      </div>

      <div className={`flex max-w-[85%] items-center gap-1 ${me ? 'flex-row-reverse' : ''}`}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            onBlur={saveEdit}
            maxLength={4000}
            className="w-64 rounded-lg border border-honey bg-[var(--color-input-bg)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none"
          />
        ) : (
          <div className={`flex max-w-full flex-col gap-1 ${me ? 'items-end' : 'items-start'}`}>
            {m.imageUrl && (
              <button type="button" onClick={() => onOpenImage(m.imageUrl!)} className="block">
                <img
                  src={imageSrc(m.imageUrl)}
                  alt=""
                  // Off-screen history no longer costs anything to scroll past:
                  // the image is a real URL now, so the browser can defer it and
                  // decode it off the main thread.
                  loading="lazy"
                  decoding="async"
                  className="max-h-60 max-w-full cursor-zoom-in rounded-2xl border border-[var(--color-border)]"
                />
              </button>
            )}
            {m.body && (
              <div
                className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                  me ? 'bg-honey text-hive-800' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]'
                }`}
              >
                {renderBody(m.body, memberNames)}
              </div>
            )}
          </div>
        )}

        {/* Hover actions */}
        {!editing && (
          <div className="relative flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              title="Réagir"
              className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
            >
              <SmilePlus size={14} />
            </button>
            {me && (
              <>
                <button onClick={() => { setDraft(m.body); setEditing(true); }} title="Modifier"
                  className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]">
                  <Pencil size={14} />
                </button>
                <button onClick={() => onDelete(m.id)} title="Supprimer"
                  className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-red/20 hover:text-red">
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {pickerOpen && (
              <div className="absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-bg)] p-1 shadow-lg">
                {REACTION_EMOJIS.map((e) => (
                  <button key={e} onClick={() => { onToggleReaction(m.id, e, agg.get(e)?.mine ?? false); setPickerOpen(false); }}
                    className="rounded-md px-1 text-base hover:bg-[var(--color-hover-bg)]">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reactions */}
      {agg.size > 0 && (
        <div className={`mt-1 flex flex-wrap gap-1 ${me ? 'justify-end' : ''}`}>
          {[...agg.entries()].map(([emoji, { count, mine }]) => (
            <button
              key={emoji}
              onClick={() => onToggleReaction(m.id, emoji, mine)}
              className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
                mine ? 'border-honey bg-honey/15' : 'border-[var(--color-border)] hover:bg-[var(--color-hover-bg)]'
              }`}
            >
              <span>{emoji}</span>
              <span className="text-[var(--color-text-secondary)]">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageDaySeparator({ createdAt }: { createdAt: string }) {
  return (
    <div role="separator" aria-label={formatMessageDateTime(createdAt)} className="flex items-center gap-2 py-1">
      <span className="h-px flex-1 bg-[var(--color-border)]" />
      <time
        dateTime={createdAt}
        className="text-[10px] font-medium text-[var(--color-text-tertiary)]"
      >
        {formatMessageDay(createdAt)}
      </time>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

function ListItem({
  active,
  unread,
  unreadTone = 'honey',
  onClick,
  icon,
  label,
}: {
  active: boolean;
  unread: number;
  unreadTone?: 'honey' | 'red';
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`relative mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active
          ? 'bg-[var(--color-active-bg)] font-medium text-[var(--color-active-text)] before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--color-active-accent)] before:content-[""]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Badge count={unread} tone={unreadTone} />
    </button>
  );
}
