'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RtcSignalMessage, RtcSignalPayload, SpaceProximityPayload } from '@nestwork/shared';
import { useWorkspacePresence } from './WorkspaceDomains';
import { useAuthStore } from '../stores/auth';
import { getIceServers } from '../lib/ice';
import {
  DEFAULT_MIC_SENSITIVITY,
  MIC_SENSITIVITY_MAX,
  MIC_SENSITIVITY_STORAGE_KEY,
  clampMicSensitivity,
  createMicrophonePipeline,
  parseStoredMicSensitivity,
} from '../lib/microphoneGate';
import type { MicMeterReading, MicrophonePipeline } from '../lib/microphoneGate';
import { fanoutLocalTrack, MAX_NEAR_PEERS, orderedPeerTargets, reconcilePeerTargets, routePeerSignal } from '../lib/peerSessions';
import { attachVoiceActivityDetector } from '../lib/voiceActivity';

const MIC_DEVICE_STORAGE_KEY = 'nw:micId';
const CAM_DEVICE_STORAGE_KEY = 'nw:camId';

function readLocalSetting(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function persistLocalSetting(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ }
}

interface WebRtcSignal {
  description?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
  screen?: boolean;
  camera?: boolean;
}

export interface RemotePeerMedia {
  id: string;
  name: string;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  speaking: boolean;
  muted: boolean;
  near: true;
}

interface PeerSession {
  id: string;
  name: string;
  near: true;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  audioTx: RTCRtpTransceiver | null;
  camTx: RTCRtpTransceiver | null;
  screenTx: RTCRtpTransceiver | null;
  audioTrack: MediaStreamTrack | null;
  camTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  screenOn: boolean;
  cameraOn: boolean;
  speaking: boolean;
  muted: boolean;
  offerRetry: ReturnType<typeof setTimeout> | null;
  offerTries: number;
  stopVad: (() => void) | null;
}

interface MediaValue {
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  speaking: boolean;
  error: string;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remotePeers: RemotePeerMedia[];
  toggleRemoteMute: (peerId: string) => void;
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  micId: string | null;
  camId: string | null;
  micSensitivity: number;
  micGateAvailable: boolean | null;
  selectMic: (id: string) => Promise<void>;
  selectCam: (id: string) => Promise<void>;
  setMicSensitivity: (value: number) => void;
  subscribeMicMeter: (listener: (reading: MicMeterReading) => void) => () => void;
}

const MediaContext = createContext<MediaValue | null>(null);

const AUDIO_PROCESSING: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

async function acquireAudio(deviceId: string | null): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId }, ...AUDIO_PROCESSING } : AUDIO_PROCESSING,
    });
  } catch (error) {
    if (deviceId) return navigator.mediaDevices.getUserMedia({ audio: AUDIO_PROCESSING });
    throw error;
  }
}

async function acquireVideo(deviceId: string | null): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true });
  } catch (error) {
    if (deviceId) return navigator.mediaDevices.getUserMedia({ video: true });
    throw error;
  }
}

export function MediaProvider({ children }: { children: ReactNode }) {
  const { socket, onlineUserIds, members } = useWorkspacePresence();
  const myId = useAuthStore((state) => state.user?.id ?? '');
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeerMedia[]>([]);
  const [iceServers, setIceServers] = useState<RTCIceServer[] | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string | null>(() => readLocalSetting(MIC_DEVICE_STORAGE_KEY));
  const [camId, setCamId] = useState<string | null>(() => readLocalSetting(CAM_DEVICE_STORAGE_KEY));
  // Hydrate with a deterministic value, then restore the local preference in
  // an effect so server markup and the first client render always match.
  const [micSensitivity, setMicSensitivityState] = useState(DEFAULT_MIC_SENSITIVITY);
  const [micGateAvailable, setMicGateAvailable] = useState<boolean | null>(null);
  const [audioRevision, setAudioRevision] = useState(0);

  const mountedRef = useRef(true);
  const micOnRef = useRef(micOn);
  const camOnRef = useRef(camOn);
  const screenOnRef = useRef(screenOn);
  const micSensitivityRef = useRef(micSensitivity);
  micOnRef.current = micOn;
  camOnRef.current = camOn;
  screenOnRef.current = screenOn;
  micSensitivityRef.current = micSensitivity;
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  if (typeof window !== 'undefined' && !localStreamRef.current) localStreamRef.current = new MediaStream();
  if (typeof window !== 'undefined' && !localScreenRef.current) localScreenRef.current = new MediaStream();
  const sessionsRef = useRef(new Map<string, PeerSession>());
  const nearIdsRef = useRef(new Set<string>());
  const onlineIdsRef = useRef<string[]>(onlineUserIds);
  const namesRef = useRef(new Map<string, string>());
  const createPeerRef = useRef<(peerId: string) => void>(() => undefined);
  const closePeerRef = useRef<(peerId: string) => void>(() => undefined);
  const handleSignalRef = useRef<(message: RtcSignalMessage) => Promise<void>>(async () => undefined);
  const microphonePipelineRef = useRef<MicrophonePipeline | null>(null);
  const microphoneRequestRef = useRef(0);
  const micMeterListenersRef = useRef(new Set<(reading: MicMeterReading) => void>());
  const lastMicMeterRef = useRef<MicMeterReading>({ levelDb: Number.NEGATIVE_INFINITY, gateOpen: false });

  onlineIdsRef.current = onlineUserIds;
  namesRef.current = new Map(members.map((member) => [member.userId, member.user.name]));

  const publishMicMeter = useCallback((reading: MicMeterReading) => {
    lastMicMeterRef.current = reading;
    for (const listener of micMeterListenersRef.current) {
      try { listener(reading); } catch { /* A broken visual subscriber must not interrupt audio. */ }
    }
  }, []);

  const subscribeMicMeter = useCallback((listener: (reading: MicMeterReading) => void) => {
    micMeterListenersRef.current.add(listener);
    listener(lastMicMeterRef.current);
    return () => { micMeterListenersRef.current.delete(listener); };
  }, []);

  const publishPeers = useCallback(() => {
    if (!mountedRef.current) return;
    setRemotePeers([...sessionsRef.current.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, name, stream, screenStream, speaking: remoteSpeaking, muted }) => ({
        id, name, stream, screenStream, speaking: remoteSpeaking, muted, near: true,
      })));
  }, []);

  const fanoutTrack = useCallback((kind: 'audio' | 'camera' | 'screen', track: MediaStreamTrack | null) => {
    void fanoutLocalTrack(sessionsRef.current.values(), async (session) => {
      const sender = kind === 'audio' ? session.audioTx?.sender : kind === 'camera' ? session.camTx?.sender : session.screenTx?.sender;
      await sender?.replaceTrack(track);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!localStreamRef.current) localStreamRef.current = new MediaStream();
    if (!localScreenRef.current) localScreenRef.current = new MediaStream();
    const sessions = sessionsRef.current;
    const nearIds = nearIdsRef.current;
    const micMeterListeners = micMeterListenersRef.current;
    return () => {
      mountedRef.current = false;
      microphoneRequestRef.current += 1;
      const microphonePipeline = microphonePipelineRef.current;
      microphonePipelineRef.current = null;
      microphonePipeline?.dispose();
      micMeterListeners.clear();
      for (const peerId of [...sessions.keys()]) closePeerRef.current(peerId);
      for (const stream of [localStreamRef.current, localScreenRef.current]) {
        stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); stream.removeTrack(track); });
      }
      localStreamRef.current = null;
      localScreenRef.current = null;
      nearIds.clear();
    };
  }, []);

  useEffect(() => {
    const stored = parseStoredMicSensitivity(readLocalSetting(MIC_SENSITIVITY_STORAGE_KEY));
    micSensitivityRef.current = stored;
    setMicSensitivityState(stored);
  }, []);

  useEffect(() => {
    if (!micOn || !localStreamRef.current) { setSpeaking(false); return; }
    return attachVoiceActivityDetector(localStreamRef.current, setSpeaking);
  }, [micOn, audioRevision]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 4_000);
    return () => clearTimeout(timer);
  }, [error]);

  const refreshDevices = useCallback(() => {
    void navigator.mediaDevices?.enumerateDevices().then((devices) => {
      setMics(devices.filter(({ kind }) => kind === 'audioinput'));
      setCams(devices.filter(({ kind }) => kind === 'videoinput'));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    let active = true;
    void getIceServers().then((servers) => { if (active) setIceServers(servers); });
    return () => { active = false; };
  }, []);

  // Record proximity immediately, even while TURN credentials are still
  // loading. Otherwise a one-shot near=true emitted during bootstrap could be
  // missed and no session would open until somebody moved again.
  useEffect(() => {
    if (!socket) return;
    const onProximity = (event: SpaceProximityPayload) => {
      if (event.near) nearIdsRef.current.add(event.userId);
      else nearIdsRef.current.delete(event.userId);
      const targets = orderedPeerTargets(myId, onlineIdsRef.current, nearIdsRef.current);
      const changes = reconcilePeerTargets(sessionsRef.current.keys(), targets);
      changes.close.forEach((id) => closePeerRef.current(id));
      changes.open.forEach((id) => createPeerRef.current(id));
    };
    socket.on('space:proximity', onProximity);
    return () => { socket.off('space:proximity', onProximity); };
  }, [socket, myId]);

  useEffect(() => {
    if (!socket || !myId || !iceServers) return;
    const sessions = sessionsRef.current;

    const send = (session: PeerSession, signal: WebRtcSignal) => {
      if (!sessions.has(session.id) || !nearIdsRef.current.has(session.id)) return;
      const payload: RtcSignalPayload = { to: session.id, signal };
      socket.emit('rtc:signal', payload);
    };
    const attachLocal = (session: PeerSession) => {
      void session.audioTx?.sender.replaceTrack(localStreamRef.current?.getAudioTracks()[0] ?? null).catch(() => undefined);
      void session.camTx?.sender.replaceTrack(localStreamRef.current?.getVideoTracks()[0] ?? null).catch(() => undefined);
      void session.screenTx?.sender.replaceTrack(localScreenRef.current?.getVideoTracks()[0] ?? null).catch(() => undefined);
    };
    const clearRetry = (session: PeerSession) => {
      if (session.offerRetry) clearTimeout(session.offerRetry);
      session.offerRetry = null;
    };
    const armRetry = (session: PeerSession) => {
      clearRetry(session);
      if (session.offerTries >= 16) return;
      session.offerRetry = setTimeout(() => {
        if (session.pc.signalingState === 'have-local-offer' && session.pc.localDescription) {
          session.offerTries += 1;
          send(session, { description: session.pc.localDescription });
          armRetry(session);
        }
      }, 800);
    };
    const rebuildBubble = (session: PeerSession) => {
      const visibleCameraTrack = session.cameraOn && session.camTrack && !session.camTrack.muted
        ? session.camTrack
        : null;
      const tracks = [session.audioTrack, visibleCameraTrack].filter((track): track is MediaStreamTrack => track !== null);
      session.stream = tracks.length ? new MediaStream(tracks) : null;
      session.stopVad?.();
      // Remote transceivers expose a muted audio track even when the peer has no
      // microphone enabled. Create an AudioContext only once real audio unmutes.
      session.stopVad = session.audioTrack && !session.audioTrack.muted && session.stream
        ? attachVoiceActivityDetector(session.stream, (value) => {
          if (session.speaking !== value) { session.speaking = value; publishPeers(); }
        })
        : null;
      publishPeers();
    };
    const closePeer = (peerId: string) => {
      const session = sessions.get(peerId);
      if (!session) return;
      sessions.delete(peerId);
      clearRetry(session);
      session.stopVad?.();
      session.pc.getSenders().forEach((sender) => { void sender.replaceTrack(null).catch(() => undefined); });
      session.pc.ontrack = null;
      session.pc.onicecandidate = null;
      session.pc.onnegotiationneeded = null;
      session.pc.close();
      publishPeers();
    };
    const createPeer = (peerId: string) => {
      if (sessions.has(peerId) || !nearIdsRef.current.has(peerId)) return;
      const targets = orderedPeerTargets(myId, onlineIdsRef.current, nearIdsRef.current, MAX_NEAR_PEERS);
      if (!targets.includes(peerId)) return;
      const pc = new RTCPeerConnection({ iceServers });
      const session: PeerSession = {
        id: peerId, name: namesRef.current.get(peerId) ?? 'Invité', near: true, pc,
        polite: myId > peerId, makingOffer: false, ignoreOffer: false, pendingCandidates: [],
        audioTx: null, camTx: null, screenTx: null,
        audioTrack: null, camTrack: null, screenTrack: null,
        stream: null, screenStream: null, screenOn: false, cameraOn: false, speaking: false, muted: false,
        offerRetry: null, offerTries: 0, stopVad: null,
      };
      sessions.set(peerId, session);
      pc.addEventListener('signalingstatechange', () => {
        if (pc.signalingState === 'stable') { session.offerTries = 0; clearRetry(session); }
      });
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          send(session, { screen: screenOnRef.current, camera: camOnRef.current });
        }
      });
      pc.onicecandidate = ({ candidate }) => { if (candidate) send(session, { candidate }); };
      pc.onnegotiationneeded = async () => {
        if (session.polite) return;
        try {
          session.makingOffer = true;
          await pc.setLocalDescription();
          send(session, { description: pc.localDescription });
          armRetry(session);
        } catch {
          // A later negotiationneeded or retry recovers transient browser errors.
        } finally {
          session.makingOffer = false;
        }
      };
      pc.ontrack = ({ transceiver, track }) => {
        const index = pc.getTransceivers().indexOf(transceiver);
        if (index === 2) {
          session.screenTrack = track;
          track.onended = () => { session.screenTrack = null; session.screenStream = null; publishPeers(); };
          session.screenStream = session.screenOn ? new MediaStream([track]) : null;
          publishPeers();
        } else {
          if (index === 0) {
            session.audioTrack = track;
            track.onunmute = () => rebuildBubble(session);
            track.onmute = () => {
              session.stopVad?.();
              session.stopVad = null;
              session.speaking = false;
              publishPeers();
            };
          }
          if (index === 1) {
            session.camTrack = track;
            track.onmute = () => rebuildBubble(session);
            track.onunmute = () => rebuildBubble(session);
            track.onended = () => { session.camTrack = null; rebuildBubble(session); };
          }
          rebuildBubble(session);
        }
      };
      if (!session.polite) {
        session.audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
        session.camTx = pc.addTransceiver('video', { direction: 'sendrecv' });
        session.screenTx = pc.addTransceiver('video', { direction: 'sendrecv' });
        attachLocal(session);
      }
      publishPeers();
    };

    createPeerRef.current = createPeer;
    closePeerRef.current = closePeer;
    handleSignalRef.current = async (message) => {
      let session = routePeerSignal(sessions, message.from);
      if (!session && nearIdsRef.current.has(message.from)) {
        createPeer(message.from);
        session = routePeerSignal(sessions, message.from);
      }
      if (!session) return;
      const signal = typeof message.signal === 'object' && message.signal !== null ? message.signal as WebRtcSignal : {};
      if (signal.screen !== undefined) {
        session.screenOn = signal.screen;
        session.screenStream = signal.screen && session.screenTrack ? new MediaStream([session.screenTrack]) : null;
        publishPeers();
      }
      if (signal.camera !== undefined) {
        session.cameraOn = signal.camera;
        rebuildBubble(session);
      }
      if ((signal.screen !== undefined || signal.camera !== undefined) && !signal.description && !signal.candidate) return;
      try {
        if (signal.description) {
          const collision = signal.description.type === 'offer' && (session.makingOffer || session.pc.signalingState !== 'stable');
          session.ignoreOffer = !session.polite && collision;
          if (session.ignoreOffer) return;
          await session.pc.setRemoteDescription(signal.description);
          for (const candidate of session.pendingCandidates.splice(0)) {
            await session.pc.addIceCandidate(candidate);
          }
          if (signal.description.type === 'offer') {
            if (!session.audioTx) {
              const transceivers = session.pc.getTransceivers();
              [session.audioTx, session.camTx, session.screenTx] = [transceivers[0] ?? null, transceivers[1] ?? null, transceivers[2] ?? null];
              transceivers.slice(0, 3).forEach((transceiver) => { transceiver.direction = 'sendrecv'; });
              attachLocal(session);
            }
            await session.pc.setLocalDescription();
            send(session, { description: session.pc.localDescription });
          }
        } else if (signal.candidate) {
          if (!session.pc.remoteDescription) {
            if (session.pendingCandidates.length < 64) session.pendingCandidates.push(signal.candidate);
            return;
          }
          try { await session.pc.addIceCandidate(signal.candidate); }
          catch { if (!session.ignoreOffer) throw new Error('ICE candidate rejected'); }
        }
      } catch {
        // Invalid/stale signals are isolated to their target session.
      }
    };

    const onSignal = (message: RtcSignalMessage) => { void handleSignalRef.current(message); };
    socket.on('rtc:signal', onSignal);

    const targets = orderedPeerTargets(myId, onlineIdsRef.current, nearIdsRef.current);
    reconcilePeerTargets(sessions.keys(), targets).open.forEach(createPeer);
    return () => {
      socket.off('rtc:signal', onSignal);
      for (const peerId of [...sessions.keys()]) closePeer(peerId);
      createPeerRef.current = () => undefined;
      closePeerRef.current = () => undefined;
      handleSignalRef.current = async () => undefined;
    };
  }, [socket, myId, iceServers, publishPeers]);

  useEffect(() => {
    const online = new Set(onlineUserIds);
    for (const peerId of nearIdsRef.current) {
      if (!online.has(peerId)) nearIdsRef.current.delete(peerId);
    }
    let renamed = false;
    for (const session of sessionsRef.current.values()) {
      const name = namesRef.current.get(session.id) ?? 'Invité';
      if (session.name !== name) { session.name = name; renamed = true; }
    }
    if (renamed) publishPeers();
    const targets = orderedPeerTargets(myId, onlineUserIds, nearIdsRef.current);
    const changes = reconcilePeerTargets(sessionsRef.current.keys(), targets);
    changes.close.forEach((id) => closePeerRef.current(id));
    changes.open.forEach((id) => createPeerRef.current(id));
  }, [members, myId, onlineUserIds, publishPeers]);

  useEffect(() => {
    if (!socket) return;
    for (const session of sessionsRef.current.values()) {
      socket.emit('rtc:signal', { to: session.id, signal: { screen: screenOn } });
    }
  }, [socket, screenOn]);

  useEffect(() => {
    if (!socket) return;
    for (const session of sessionsRef.current.values()) {
      socket.emit('rtc:signal', { to: session.id, signal: { camera: camOn } });
    }
  }, [socket, camOn]);

  const replaceLocalTrack = useCallback((stream: MediaStream | null, kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
    if (!stream) { track?.stop(); return; }
    const oldTracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
    oldTracks.forEach((old) => { old.onended = null; old.stop(); stream.removeTrack(old); });
    if (track) stream.addTrack(track);
  }, []);

  const setAudio = useCallback((track: MediaStreamTrack | null) => {
    replaceLocalTrack(localStreamRef.current, 'audio', track);
    fanoutTrack('audio', track);
    setAudioRevision((value) => value + 1);
  }, [fanoutTrack, replaceLocalTrack]);

  const installMicrophonePipeline = useCallback((pipeline: MicrophonePipeline | null) => {
    const previous = microphonePipelineRef.current;
    microphonePipelineRef.current = pipeline;
    setAudio(pipeline?.track ?? null);
    setMicGateAvailable(pipeline?.gateAvailable ?? null);
    if (previous !== pipeline) previous?.dispose();
    if (!pipeline) publishMicMeter({ levelDb: Number.NEGATIVE_INFINITY, gateOpen: false });
  }, [publishMicMeter, setAudio]);

  const setMicSensitivity = useCallback((value: number) => {
    const normalized = clampMicSensitivity(value);
    micSensitivityRef.current = normalized;
    setMicSensitivityState(normalized);
    microphonePipelineRef.current?.setSensitivity(normalized);
    persistLocalSetting(MIC_SENSITIVITY_STORAGE_KEY, String(normalized));
  }, []);

  const setCamera = useCallback((track: MediaStreamTrack | null) => {
    replaceLocalTrack(localStreamRef.current, 'video', track);
    fanoutTrack('camera', track);
  }, [fanoutTrack, replaceLocalTrack]);
  const installCameraTrack = useCallback((track: MediaStreamTrack) => {
    track.onended = () => {
      if (!mountedRef.current || !localStreamRef.current?.getVideoTracks().includes(track)) return;
      setCamera(null);
      setCamOn(false);
    };
    setCamera(track);
  }, [setCamera]);
  const setScreen = useCallback((track: MediaStreamTrack | null) => {
    replaceLocalTrack(localScreenRef.current, 'video', track);
    fanoutTrack('screen', track);
    setLocalScreenStream(track ? localScreenRef.current : null);
  }, [fanoutTrack, replaceLocalTrack]);

  const toggleMic = useCallback(async () => {
    setError('');
    const request = ++microphoneRequestRef.current;
    if (micOn) { installMicrophonePipeline(null); setMicOn(false); return; }
    let stream: MediaStream | null = null;
    try {
      stream = await acquireAudio(micId);
      if (!mountedRef.current || request !== microphoneRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const pipeline = await createMicrophonePipeline(stream, micSensitivityRef.current, publishMicMeter);
      stream = null; // Ownership moved to the pipeline, including its fallback path.
      if (!mountedRef.current || request !== microphoneRequestRef.current) { pipeline.dispose(); return; }
      const activeDeviceId = pipeline.deviceId ?? micId;
      setMicId(activeDeviceId);
      if (activeDeviceId) persistLocalSetting(MIC_DEVICE_STORAGE_KEY, activeDeviceId);
      installMicrophonePipeline(pipeline);
      setMicOn(true);
      refreshDevices();
      if (!pipeline.gateAvailable && micSensitivityRef.current < MIC_SENSITIVITY_MAX) {
        setError("Le filtrage du micro n'est pas pris en charge par ce navigateur");
      }
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (request === microphoneRequestRef.current) setError('Micro indisponible ou refusé');
    }
  }, [installMicrophonePipeline, micId, micOn, publishMicMeter, refreshDevices]);

  const toggleCam = useCallback(async () => {
    setError('');
    if (camOn) { setCamera(null); setCamOn(false); return; }
    try {
      const stream = await acquireVideo(camId);
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const track = stream.getVideoTracks()[0];
      setCamId(track.getSettings().deviceId ?? camId);
      installCameraTrack(track); setCamOn(true); refreshDevices();
    } catch { setError('Caméra indisponible ou refusée'); }
  }, [camId, camOn, installCameraTrack, refreshDevices, setCamera]);

  const selectMic = useCallback(async (id: string) => {
    if (!micOn) {
      setMicId(id);
      persistLocalSetting(MIC_DEVICE_STORAGE_KEY, id);
      return;
    }
    const request = ++microphoneRequestRef.current;
    let stream: MediaStream | null = null;
    try {
      stream = await acquireAudio(id);
      if (!mountedRef.current || !micOnRef.current || request !== microphoneRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const pipeline = await createMicrophonePipeline(stream, micSensitivityRef.current, publishMicMeter);
      stream = null;
      if (!mountedRef.current || !micOnRef.current || request !== microphoneRequestRef.current) { pipeline.dispose(); return; }
      const activeDeviceId = pipeline.deviceId ?? id;
      setMicId(activeDeviceId);
      persistLocalSetting(MIC_DEVICE_STORAGE_KEY, activeDeviceId);
      installMicrophonePipeline(pipeline);
      if (!pipeline.gateAvailable && micSensitivityRef.current < MIC_SENSITIVITY_MAX) {
        setError("Le filtrage du micro n'est pas pris en charge par ce navigateur");
      }
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (request === microphoneRequestRef.current) setError('Micro indisponible ou refusé');
    }
  }, [installMicrophonePipeline, micOn, publishMicMeter]);

  const selectCam = useCallback(async (id: string) => {
    setCamId(id); persistLocalSetting(CAM_DEVICE_STORAGE_KEY, id);
    if (!camOn) return;
    try {
      const stream = await acquireVideo(id);
      if (!mountedRef.current || !camOnRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      installCameraTrack(stream.getVideoTracks()[0]);
    } catch { setError('Caméra indisponible ou refusée'); }
  }, [camOn, installCameraTrack]);

  const toggleScreen = useCallback(async () => {
    setError('');
    if (screenOn) { setScreen(null); setScreenOn(false); return; }
    try {
      const stream = await (navigator.mediaDevices as MediaDevices & { getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream> }).getDisplayMedia({ video: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const track = stream.getVideoTracks()[0];
      setScreen(track);
      track.onended = () => { if (mountedRef.current) { setScreen(null); setScreenOn(false); } };
      setScreenOn(true);
    } catch { setError("Partage d'écran annulé"); }
  }, [screenOn, setScreen]);

  const toggleRemoteMute = useCallback((peerId: string) => {
    const session = sessionsRef.current.get(peerId);
    if (!session) return;
    session.muted = !session.muted;
    publishPeers();
  }, [publishPeers]);

  const value = useMemo<MediaValue>(() => ({
    micOn, camOn, screenOn, speaking, error,
    toggleMic, toggleCam, toggleScreen,
    localStream: localStreamRef.current, localScreenStream,
    remotePeers, toggleRemoteMute,
    mics, cams, micId, camId, micSensitivity, micGateAvailable,
    selectMic, selectCam, setMicSensitivity, subscribeMicMeter,
  }), [micOn, camOn, screenOn, speaking, error, toggleMic, toggleCam, toggleScreen, localScreenStream, remotePeers, toggleRemoteMute, mics, cams, micId, camId, micSensitivity, micGateAvailable, selectMic, selectCam, setMicSensitivity, subscribeMicMeter]);

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

export function useMedia() {
  const context = useContext(MediaContext);
  if (!context) throw new Error('useMedia must be used within MediaProvider');
  return context;
}
