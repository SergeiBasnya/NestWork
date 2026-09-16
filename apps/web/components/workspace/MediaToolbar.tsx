'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, LogOut, Smile, MessageCircle, ChevronUp, Check, Home, Lock, LockOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth';
import { useMedia } from '../../contexts/MediaContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { logoutSession } from '../../lib/authSession';
import { shouldToggleMicFromKeyboard } from '../../lib/mediaShortcuts';
import {
  MIC_SENSITIVITY_MAX,
  MIC_SENSITIVITY_MIN,
  dbToMeterLevel,
  sensitivityToGateThresholdDb,
  type MicMeterReading,
} from '../../lib/microphoneGate';
import { EMOTES, emoteFile } from '../../game/emotes';
import { ProfileMenu } from './ProfileMenu';
import { IconButton, Badge } from '../ui';

// Small chevron next to the mic/cam buttons that opens a list of input devices.
function DevicePicker({
  devices,
  currentId,
  onSelect,
  title,
}: {
  devices: MediaDeviceInfo[];
  currentId: string | null;
  onSelect: (id: string) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-6 items-center justify-center rounded-md text-hive-300 transition-colors hover:bg-hive-700 hover:text-white"
      >
        <ChevronUp size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-1/2 z-20 mb-3 max-h-60 w-60 -translate-x-1/2 overflow-auto rounded-2xl border border-hive-600 bg-hive-800 p-1 shadow-xl">
            {devices.length === 0 ? (
              <div className="px-3 py-2 text-xs text-hive-300">Aucun périphérique</div>
            ) : (
              devices.map((d, i) => {
                const active = d.deviceId === currentId;
                return (
                  <button
                    key={d.deviceId || i}
                    onClick={() => {
                      setOpen(false);
                      // Reselecting the active device would needlessly re-acquire
                      // the stream (a visible flicker) — skip it.
                      if (d.deviceId !== currentId) onSelect(d.deviceId);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition-colors ${
                      active ? 'bg-hive-700 text-white' : 'text-hive-200 hover:bg-hive-700'
                    }`}
                  >
                    <Check size={12} className={active ? 'opacity-100' : 'opacity-0'} />
                    <span className="truncate">{d.label || `Périphérique ${i + 1}`}</span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

const SILENT_MIC_READING: MicMeterReading = { levelDb: -80, gateOpen: false };

function sensitivityLabel(value: number): string {
  if (value === MIC_SENSITIVITY_MAX) return 'Maximale · aucun filtrage';
  if (value >= 75) return 'Élevée';
  if (value >= 50) return 'Moyenne';
  if (value >= 25) return 'Faible';
  return 'Très faible';
}

function MicrophoneSettingsPicker({
  devices,
  currentId,
  onSelect,
  micOn,
  sensitivity,
  onSensitivityChange,
  subscribeMeter,
  gateAvailable,
}: {
  devices: MediaDeviceInfo[];
  currentId: string | null;
  onSelect: (id: string) => void;
  micOn: boolean;
  sensitivity: number;
  onSensitivityChange: (value: number) => void;
  subscribeMeter: (listener: (reading: MicMeterReading) => void) => () => void;
  gateAvailable: boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const [meterReading, setMeterReading] = useState<MicMeterReading>(SILENT_MIC_READING);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const sensitivityId = `${dialogId}-sensitivity`;
  const normalizedSensitivity = Math.min(MIC_SENSITIVITY_MAX, Math.max(MIC_SENSITIVITY_MIN, Math.round(sensitivity)));
  const label = sensitivityLabel(normalizedSensitivity);
  const thresholdDb = sensitivityToGateThresholdDb(normalizedSensitivity);
  const levelPercent = micOn ? dbToMeterLevel(meterReading.levelDb) * 100 : 0;
  const thresholdPercent = thresholdDb === null ? null : dbToMeterLevel(thresholdDb) * 100;
  const filteringUnavailable = normalizedSensitivity < MIC_SENSITIVITY_MAX && gateAvailable === false;

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMeterReading(SILENT_MIC_READING);
    return subscribeMeter((reading) => {
      setMeterReading((current) => (
        current.levelDb === reading.levelDb && current.gateOpen === reading.gateOpen
          ? current
          : { levelDb: reading.levelDb, gateOpen: reading.gateOpen }
      ));
    });
  }, [open, subscribeMeter]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const closeWhenOutside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return;
      if (dialogRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => closeWhenOutside(event.target);
    const onFocusIn = (event: FocusEvent) => closeWhenOutside(event.target);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (open) close(); else setOpen(true); }}
        title="Réglages du micro"
        aria-label="Réglages du micro"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={open}
        className="flex h-9 w-6 items-center justify-center rounded-md text-hive-300 transition-colors hover:bg-hive-700 hover:text-white"
      >
        <ChevronUp size={12} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={dialogRef}
          id={dialogId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="absolute bottom-full left-0 z-20 mb-3 max-h-[calc(100vh-8rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-hive-600 bg-hive-800 p-3 text-hive-100 shadow-xl"
        >
          <h2 id={titleId} className="font-display text-sm font-semibold text-white">
            Réglages du micro
          </h2>

          <section className="mt-3" aria-labelledby={`${dialogId}-devices-title`}>
            <h3 id={`${dialogId}-devices-title`} className="px-1 text-[10px] font-semibold uppercase tracking-wider text-hive-300">
              Périphérique
            </h3>
            <div className="mt-1 max-h-32 overflow-y-auto">
              {devices.length === 0 ? (
                <div className="px-2 py-2 text-xs text-hive-300">Aucun périphérique</div>
              ) : (
                devices.map((device, index) => {
                  const active = device.deviceId === currentId;
                  return (
                    <button
                      key={device.deviceId || index}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (!active) onSelect(device.deviceId);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition-colors ${
                        active ? 'bg-hive-700 text-white' : 'text-hive-200 hover:bg-hive-700'
                      }`}
                    >
                      <Check size={12} aria-hidden="true" className={active ? 'opacity-100' : 'opacity-0'} />
                      <span className="truncate">{device.label || `Périphérique ${index + 1}`}</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-3 border-t border-hive-600 pt-3" aria-labelledby={`${dialogId}-sensitivity-title`}>
            <div className="flex items-start justify-between gap-3 px-1">
              <h3 id={`${dialogId}-sensitivity-title`} className="text-xs font-semibold text-white">
                Sensibilité
              </h3>
              <output htmlFor={sensitivityId} className="text-right text-[10px] font-medium text-honey-300">
                {label}
              </output>
            </div>
            <label htmlFor={sensitivityId} className="sr-only">Sensibilité du micro</label>
            <input
              id={sensitivityId}
              type="range"
              min={MIC_SENSITIVITY_MIN}
              max={MIC_SENSITIVITY_MAX}
              step={1}
              value={normalizedSensitivity}
              aria-valuetext={label}
              onChange={(event) => onSensitivityChange(Number(event.currentTarget.value))}
              className="mt-2 h-5 w-full cursor-pointer accent-honey"
            />
            <div aria-hidden="true" className="flex justify-between px-1 text-[10px] text-hive-300">
              <span>Moins sensible</span>
              <span>Plus sensible</span>
            </div>
            <div className="mt-3 rounded-xl bg-hive-900/60 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2 text-[10px]">
                <span className="font-medium uppercase tracking-wide text-hive-300">Niveau du micro</span>
                <span className={micOn && (normalizedSensitivity === MIC_SENSITIVITY_MAX || meterReading.gateOpen) ? 'text-pollen-400' : 'text-hive-300'}>
                  {!micOn
                    ? 'Micro coupé'
                    : normalizedSensitivity < MIC_SENSITIVITY_MAX && gateAvailable === null
                      ? 'Initialisation…'
                      : gateAvailable === false
                        ? 'Sans filtrage'
                        : normalizedSensitivity === MIC_SENSITIVITY_MAX
                          ? 'Tout est transmis'
                          : meterReading.gateOpen
                            ? 'Son transmis'
                            : 'Son filtré'}
                </span>
              </div>
              <div
                role="meter"
                aria-label="Niveau sonore du microphone"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(levelPercent)}
                className="relative"
              >
                <div className="h-2 overflow-hidden rounded-full bg-hive-700">
                  <div
                    className={`h-full rounded-full transition-[width] duration-75 ${
                      meterReading.gateOpen || normalizedSensitivity === MIC_SENSITIVITY_MAX ? 'bg-pollen-400' : 'bg-hive-400'
                    }`}
                    style={{ width: `${levelPercent}%` }}
                  />
                </div>
                {thresholdPercent !== null && !filteringUnavailable && (
                  <span
                    aria-hidden="true"
                    title="Seuil de filtrage"
                    className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-honey"
                    style={{ left: `${thresholdPercent}%` }}
                  />
                )}
              </div>
            </div>

            {!micOn && (
              <p className="mt-2 px-1 text-[11px] text-hive-300">Activez le micro pour tester le réglage.</p>
            )}
            {filteringUnavailable && (
              <p role="status" className="mt-2 rounded-lg border border-honey/30 bg-honey/10 px-2.5 py-2 text-[11px] leading-4 text-honey-300">
                Le filtrage n’est pas disponible sur ce navigateur. Le son reste transmis sans filtrage.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// Gather-style bottom bar. Local device controls + peer transmission live in
// MediaContext; this component is the UI.
export function MediaToolbar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const {
    micOn,
    camOn,
    screenOn,
    speaking,
    error,
    toggleMic,
    toggleCam,
    toggleScreen,
    mics,
    cams,
    micId,
    camId,
    selectMic,
    selectCam,
    micSensitivity,
    setMicSensitivity,
    subscribeMicMeter,
    micGateAvailable,
  } = useMedia();
  const { sendEmote, messagingOpen, setMessagingOpen, totalUnread, decoratorMode, myDesk, goToMyDesk, dndByUserId, setMyDnd } = useWorkspace();
  const myDnd = user ? !!dndByUserId[user.id] : false;
  // Re-center the toolbar over the visible canvas when a left panel is open
  // (messaging 640px / decorator 480px) so it never covers the composer.
  const panelOffset = messagingOpen ? 320 : decoratorMode ? 240 : 0;
  const [profileOpen, setProfileOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);

  function leave() {
    void logoutSession();
    router.push('/login');
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldToggleMicFromKeyboard(event)) return;
      event.preventDefault();
      void toggleMic();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleMic]);

  return (
    <>
      <div
        className="absolute bottom-16 z-20 -translate-x-1/2 transition-[left] duration-200"
        style={{ left: `calc(50% + ${panelOffset}px)` }}
      >
        {error && (
          <div role="alert" className="mb-2 rounded-lg bg-red/90 px-3 py-1 text-center text-xs font-medium text-white">{error}</div>
        )}
        <div className="relative flex items-center gap-1.5 rounded-2xl border border-hive-600 bg-hive-800 px-3 py-2 shadow-xl">
          <div className="relative mr-1">
            <button
              data-profile-toggle
              onClick={() => setProfileOpen((v) => !v)}
              title="Profil & avatar"
              aria-label="Profil et avatar"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-honey text-sm font-bold text-hive-800 ring-2 ring-transparent transition hover:ring-honey-400"
            >
              {user?.name?.charAt(0).toUpperCase()}
            </button>
            {profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
          </div>

          <div className="flex items-center gap-1">
            <IconButton
              tone="onDark"
              activeStyle="solid"
              active={micOn}
              aria-pressed={micOn}
              aria-keyshortcuts="M"
              onClick={toggleMic}
              title={micOn ? 'Couper le micro (M)' : 'Activer le micro (M)'}
              aria-label={micOn ? 'Couper le micro' : 'Activer le micro'}
              size={36}
              className={micOn && speaking ? 'ring-2 ring-pollen ring-offset-2 ring-offset-hive-800' : ''}
              icon={micOn ? <Mic size={18} /> : <MicOff size={18} />}
            />
            <MicrophoneSettingsPicker
              devices={mics}
              currentId={micId}
              onSelect={selectMic}
              micOn={micOn}
              sensitivity={micSensitivity}
              onSensitivityChange={setMicSensitivity}
              subscribeMeter={subscribeMicMeter}
              gateAvailable={micGateAvailable}
            />
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              tone="onDark"
              activeStyle="solid"
              active={camOn}
              aria-pressed={camOn}
              onClick={toggleCam}
              title={camOn ? 'Couper la caméra' : 'Activer la caméra'}
              aria-label={camOn ? 'Couper la caméra' : 'Activer la caméra'}
              size={36}
              icon={camOn ? <Video size={18} /> : <VideoOff size={18} />}
            />
            <DevicePicker devices={cams} currentId={camId} onSelect={selectCam} title="Choisir la caméra" />
          </div>
          <IconButton
            tone="onDark"
            activeStyle="solid"
            active={screenOn}
            aria-pressed={screenOn}
            onClick={toggleScreen}
            title={screenOn ? 'Arrêter le partage' : "Partager l'écran"}
            aria-label={screenOn ? 'Arrêter le partage' : "Partager l'écran"}
            size={36}
            icon={<MonitorUp size={18} />}
          />

          {/* Ne pas déranger: verrouille le bureau (pas de visio à l'approche +
              personne ne peut entrer dans ta zone). */}
          <IconButton
            tone="onDark"
            activeStyle="solid"
            active={myDnd}
            aria-pressed={myDnd}
            onClick={() => setMyDnd(!myDnd)}
            title={myDnd ? 'Déverrouiller mon bureau' : 'Ne pas déranger — verrouiller mon bureau'}
            aria-label={myDnd ? 'Déverrouiller mon bureau' : 'Ne pas déranger'}
            size={36}
            icon={myDnd ? <Lock size={18} /> : <LockOpen size={18} />}
          />

          <div className="relative">
            <IconButton
              tone="onDark"
              activeStyle="solid"
              active={messagingOpen}
              aria-pressed={messagingOpen}
              onClick={() => setMessagingOpen(!messagingOpen)}
              title="Messagerie"
              aria-label="Messagerie"
              size={36}
              icon={<MessageCircle size={18} />}
            />
            {!messagingOpen && (
              <Badge count={totalUnread} className="pointer-events-none absolute -right-0.5 -top-0.5" />
            )}
          </div>

          <div className="relative">
            <IconButton
              tone="onDark"
              activeStyle="solid"
              active={emoteOpen}
              aria-pressed={emoteOpen}
              onClick={() => setEmoteOpen((v) => !v)}
              title="Réactions"
              aria-label="Réactions"
              size={36}
              icon={<Smile size={18} />}
            />
            {emoteOpen && (
              <div className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 gap-1 rounded-2xl border border-hive-600 bg-hive-800 p-2 shadow-xl">
                {EMOTES.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => {
                      sendEmote(e.key);
                      setEmoteOpen(false);
                    }}
                    title={e.label}
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-hive-700"
                  >
                    <img src={emoteFile(e.key)} alt={e.label} className="h-7 w-7" style={{ imageRendering: 'pixelated' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {myDesk && (
            <IconButton
              tone="onDark"
              onClick={goToMyDesk}
              title="Aller à mon bureau"
              aria-label="Aller à mon bureau"
              size={36}
              icon={<Home size={18} />}
            />
          )}

          <div className="mx-1 h-6 w-px bg-hive-600" />

          <IconButton
            tone="onDark"
            onClick={leave}
            title="Quitter"
            aria-label="Quitter"
            size={36}
            className="hover:bg-error/20 hover:text-error"
            icon={<LogOut size={18} />}
          />
        </div>
      </div>
    </>
  );
}
