export const MIC_SENSITIVITY_MIN = 0;
export const MIC_SENSITIVITY_MAX = 100;
export const DEFAULT_MIC_SENSITIVITY = 100;
export const MIC_SENSITIVITY_STORAGE_KEY = 'nw:micSensitivity';

const QUIETEST_GATE_THRESHOLD_DB = -65;
const LOUDEST_GATE_THRESHOLD_DB = -25;
const METER_FLOOR_DB = -80;
const METER_CEILING_DB = 0;
const NOISE_GATE_PROCESSOR_NAME = 'nestwork-noise-gate';
const NOISE_GATE_WORKLET_PATH = '/audio/noise-gate-processor.js';

export interface MicMeterReading {
  levelDb: number;
  gateOpen: boolean;
}

export interface MicrophonePipeline {
  /** Track to publish to the local stream and WebRTC senders. */
  readonly track: MediaStreamTrack;
  /** Device id from the physical capture track (the processed track has none). */
  readonly deviceId: string | null;
  /** False when the browser cannot run the worklet and the raw track is used. */
  readonly gateAvailable: boolean;
  setSensitivity: (sensitivity: number) => void;
  dispose: () => void;
}

interface ConfigureMessage {
  type: 'configure';
  thresholdDb: number | null;
}

interface MeterMessage {
  type: 'meter';
  levelDb: number;
  gateOpen: boolean;
}

type AudioWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

export function clampMicSensitivity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MIC_SENSITIVITY;
  return Math.min(MIC_SENSITIVITY_MAX, Math.max(MIC_SENSITIVITY_MIN, Math.round(value)));
}

export function parseStoredMicSensitivity(value: string | null | undefined): number {
  if (value == null || value.trim() === '') return DEFAULT_MIC_SENSITIVITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampMicSensitivity(parsed) : DEFAULT_MIC_SENSITIVITY;
}

/**
 * Converts the user-facing sensitivity into a dBFS gate threshold.
 *
 * A low sensitivity intentionally requires a louder, closer voice. At 100 the
 * gate is fully bypassed, preserving the pre-feature microphone behaviour.
 */
export function sensitivityToGateThresholdDb(sensitivity: number): number | null {
  const normalized = clampMicSensitivity(sensitivity);
  if (normalized === MIC_SENSITIVITY_MAX) return null;
  const progress = normalized / (MIC_SENSITIVITY_MAX - 1);
  return LOUDEST_GATE_THRESHOLD_DB
    + (QUIETEST_GATE_THRESHOLD_DB - LOUDEST_GATE_THRESHOLD_DB) * progress;
}

/** Maps a dBFS reading to the normalized 0..1 range used by the UI meter. */
export function dbToMeterLevel(levelDb: number): number {
  if (levelDb === Number.POSITIVE_INFINITY) return 1;
  if (!Number.isFinite(levelDb)) return 0;
  const normalized = (levelDb - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB);
  return Math.min(1, Math.max(0, normalized));
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.onended = null;
    track.stop();
  }
}

function createRawFallback(
  rawStream: MediaStream,
  rawTrack: MediaStreamTrack,
  deviceId: string | null,
): MicrophonePipeline {
  let disposed = false;
  return {
    track: rawTrack,
    deviceId,
    gateAvailable: false,
    setSensitivity: () => undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopTracks(rawStream);
    },
  };
}

function isMeterMessage(value: unknown): value is MeterMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MeterMessage>;
  return candidate.type === 'meter'
    && typeof candidate.levelDb === 'number'
    && Number.isFinite(candidate.levelDb)
    && typeof candidate.gateOpen === 'boolean';
}

/**
 * Owns `rawStream` and returns the audio track that should be sent to peers.
 * Unsupported/broken Web Audio implementations fail open to the raw capture so
 * enabling noise control can never make the microphone unusable.
 */
export async function createMicrophonePipeline(
  rawStream: MediaStream,
  sensitivity: number,
  onMeter?: (reading: MicMeterReading) => void,
): Promise<MicrophonePipeline> {
  const rawTrack = rawStream.getAudioTracks()[0];
  if (!rawTrack) {
    stopTracks(rawStream);
    throw new Error('The microphone stream does not contain an audio track');
  }

  const deviceId = rawTrack.getSettings().deviceId || null;
  if (typeof window === 'undefined') return createRawFallback(rawStream, rawTrack, deviceId);

  const AudioContextClass = (window as AudioWindow).AudioContext
    ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass || typeof AudioWorkletNode === 'undefined') {
    return createRawFallback(rawStream, rawTrack, deviceId);
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let gate: AudioWorkletNode | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let outputTrack: MediaStreamTrack | null = null;

  try {
    context = new AudioContextClass({ latencyHint: 'interactive' });
    if (!context.audioWorklet) throw new Error('AudioWorklet is unavailable');

    const workletUrl = new URL(NOISE_GATE_WORKLET_PATH, window.location.origin);
    await context.audioWorklet.addModule(workletUrl.href);

    const thresholdDb = sensitivityToGateThresholdDb(sensitivity);
    source = context.createMediaStreamSource(new MediaStream([rawTrack]));
    gate = new AudioWorkletNode(context, NOISE_GATE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { thresholdDb },
    });
    destination = context.createMediaStreamDestination();

    gate.port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isMeterMessage(data) || !onMeter) return;
      try {
        onMeter({ levelDb: data.levelDb, gateOpen: data.gateOpen });
      } catch {
        // UI callbacks must never interrupt the real-time audio pipeline.
      }
    };
    gate.port.start();
    gate.port.postMessage({ type: 'configure', thresholdDb } satisfies ConfigureMessage);

    source.connect(gate);
    gate.connect(destination);
    outputTrack = destination.stream.getAudioTracks()[0] ?? null;
    if (!outputTrack) throw new Error('The audio gate did not create an output track');
    outputTrack.contentHint = 'speech';

    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') throw new Error('The audio processing context could not start');
  } catch {
    outputTrack?.stop();
    try { gate?.port.close(); } catch { /* already closed */ }
    try { source?.disconnect(); } catch { /* never connected */ }
    try { gate?.disconnect(); } catch { /* never connected */ }
    try { destination?.disconnect(); } catch { /* never connected */ }
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    return createRawFallback(rawStream, rawTrack, deviceId);
  }

  // The null checks above establish these nodes. Local constants keep the
  // returned closures independent from the mutable setup variables.
  const audioContext = context;
  const sourceNode = source;
  const gateNode = gate;
  const destinationNode = destination;
  const processedTrack = outputTrack;
  let disposed = false;
  let handleRawEnded: () => void = () => undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    rawTrack.removeEventListener('ended', handleRawEnded);
    rawTrack.onended = null;
    processedTrack.onended = null;
    gateNode.port.onmessage = null;
    try { gateNode.port.postMessage({ type: 'dispose' }); } catch { /* already closed */ }
    try { gateNode.port.close(); } catch { /* already closed */ }
    try { sourceNode.disconnect(); } catch { /* already disconnected */ }
    try { gateNode.disconnect(); } catch { /* already disconnected */ }
    try { destinationNode.disconnect(); } catch { /* already disconnected */ }
    processedTrack.stop();
    stopTracks(rawStream);
    if (audioContext.state !== 'closed') void audioContext.close().catch(() => undefined);
  };

  // A physical unplug must tear down the worklet too; otherwise the generated
  // output track ends while its AudioContext keeps running until unmount.
  handleRawEnded = dispose;
  rawTrack.addEventListener('ended', handleRawEnded, { once: true });

  return {
    track: processedTrack,
    deviceId,
    gateAvailable: true,
    setSensitivity: (nextSensitivity) => {
      if (disposed) return;
      const message: ConfigureMessage = {
        type: 'configure',
        thresholdDb: sensitivityToGateThresholdDb(nextSensitivity),
      };
      try { gateNode.port.postMessage(message); } catch { /* disposed concurrently */ }
    },
    dispose,
  };
}
