import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';
import {
  DEFAULT_MIC_SENSITIVITY,
  MIC_SENSITIVITY_MAX,
  MIC_SENSITIVITY_MIN,
  MIC_SENSITIVITY_STORAGE_KEY,
  clampMicSensitivity,
  createMicrophonePipeline,
  dbToMeterLevel,
  parseStoredMicSensitivity,
  sensitivityToGateThresholdDb,
} from '../lib/microphoneGate';

const SAMPLE_RATE = 48_000;
const RENDER_QUANTUM = 128;

type PortMessageHandler = ((event: { data: unknown }) => void) | null;

class FakeMessagePort {
  onmessage: PortMessageHandler = null;
  readonly messages: unknown[] = [];

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  dispatch(data: unknown): void {
    this.onmessage?.({ data });
  }
}

class FakeAudioWorkletProcessor {
  readonly port = new FakeMessagePort();
}

interface NoiseGateProcessor extends FakeAudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

type NoiseGateProcessorConstructor = new () => NoiseGateProcessor;

function loadNoiseGateProcessor(): NoiseGateProcessor {
  const filename = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../public/audio/noise-gate-processor.js',
  );
  const source = readFileSync(filename, 'utf8');
  let registeredName = '';
  let RegisteredProcessor: NoiseGateProcessorConstructor | undefined;
  const context = createContext({
    AudioWorkletProcessor: FakeAudioWorkletProcessor,
    registerProcessor: (name: string, Processor: NoiseGateProcessorConstructor) => {
      registeredName = name;
      RegisteredProcessor = Processor;
    },
    sampleRate: SAMPLE_RATE,
  });

  new Script(source, { filename }).runInContext(context);

  assert.equal(registeredName, 'nestwork-noise-gate');
  assert.ok(RegisteredProcessor, 'the worklet must register its processor constructor');
  return new RegisteredProcessor();
}

function configure(processor: NoiseGateProcessor, thresholdDb: number | null): void {
  processor.port.dispatch({ type: 'configure', thresholdDb });
}

function processBlock(processor: NoiseGateProcessor, input: Float32Array): Float32Array {
  assert.equal(input.length, RENDER_QUANTUM);
  const output = new Float32Array(RENDER_QUANTUM);
  assert.equal(processor.process([[input]], [[output]]), true);
  return output;
}

function render(processor: NoiseGateProcessor, input: Float32Array): Float32Array {
  assert.equal(input.length % RENDER_QUANTUM, 0);
  const output = new Float32Array(input.length);
  for (let offset = 0; offset < input.length; offset += RENDER_QUANTUM) {
    output.set(processBlock(processor, input.subarray(offset, offset + RENDER_QUANTUM)), offset);
  }
  return output;
}

function peak(samples: Float32Array): number {
  let result = 0;
  for (const sample of samples) result = Math.max(result, Math.abs(sample));
  return result;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function pseudoRandomSignal(length: number, amplitude: number): Float32Array {
  const result = new Float32Array(length);
  let state = 0x9e3779b9;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result[index] = (state & 1 ? 1 : -1) * amplitude;
  }
  return result;
}

function correlationAtLag(
  input: Float32Array,
  output: Float32Array,
  outputStart: number,
  length: number,
  lag: number,
): number {
  let product = 0;
  let inputEnergy = 0;
  let outputEnergy = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const inputSample = input[outputStart + offset - lag] ?? 0;
    const outputSample = output[outputStart + offset] ?? 0;
    product += inputSample * outputSample;
    inputEnergy += inputSample * inputSample;
    outputEnergy += outputSample * outputSample;
  }
  return product / Math.sqrt(inputEnergy * outputEnergy || 1);
}

describe('microphone sensitivity settings', () => {
  test('exports stable bounds and clamps finite or invalid values safely', () => {
    assert.equal(MIC_SENSITIVITY_MIN, 0);
    assert.equal(MIC_SENSITIVITY_MAX, 100);
    assert.equal(DEFAULT_MIC_SENSITIVITY, 100);
    assert.equal(MIC_SENSITIVITY_STORAGE_KEY, 'nw:micSensitivity');

    assert.equal(clampMicSensitivity(-1), MIC_SENSITIVITY_MIN);
    assert.equal(clampMicSensitivity(42), 42);
    assert.equal(clampMicSensitivity(101), MIC_SENSITIVITY_MAX);
    assert.equal(clampMicSensitivity(Number.NaN), DEFAULT_MIC_SENSITIVITY);
    assert.equal(clampMicSensitivity(Number.POSITIVE_INFINITY), DEFAULT_MIC_SENSITIVITY);
  });

  test('parses persisted values and rejects missing, empty or non-finite storage', () => {
    for (const invalid of [null, '', '   ', 'not-a-number', 'NaN', 'Infinity', '-Infinity']) {
      assert.equal(parseStoredMicSensitivity(invalid), DEFAULT_MIC_SENSITIVITY);
    }
    assert.equal(parseStoredMicSensitivity('-20'), MIC_SENSITIVITY_MIN);
    assert.equal(parseStoredMicSensitivity('37'), 37);
    assert.equal(parseStoredMicSensitivity('120'), MIC_SENSITIVITY_MAX);
  });

  test('maps sensitivity monotonically to bounded thresholds and reserves 100 for bypass', () => {
    assert.equal(sensitivityToGateThresholdDb(MIC_SENSITIVITY_MIN), -25);
    assert.equal(sensitivityToGateThresholdDb(99), -65);
    assert.equal(sensitivityToGateThresholdDb(MIC_SENSITIVITY_MAX), null);

    let previous = sensitivityToGateThresholdDb(MIC_SENSITIVITY_MIN);
    assert.notEqual(previous, null);
    for (let sensitivity = MIC_SENSITIVITY_MIN + 1; sensitivity < MIC_SENSITIVITY_MAX; sensitivity += 1) {
      const threshold = sensitivityToGateThresholdDb(sensitivity);
      assert.notEqual(threshold, null);
      assert.ok(threshold! < previous!, `${sensitivity} must be more sensitive than ${sensitivity - 1}`);
      assert.ok(threshold! >= -65 && threshold! <= -25);
      previous = threshold;
    }
  });

  test('maps dBFS to a clamped linear meter level', () => {
    assert.equal(dbToMeterLevel(Number.NaN), 0);
    assert.equal(dbToMeterLevel(Number.NEGATIVE_INFINITY), 0);
    assert.equal(dbToMeterLevel(-100), 0);
    assert.equal(dbToMeterLevel(-80), 0);
    assert.equal(dbToMeterLevel(-40), 0.5);
    assert.equal(dbToMeterLevel(0), 1);
    assert.equal(dbToMeterLevel(12), 1);
    assert.equal(dbToMeterLevel(Number.POSITIVE_INFINITY), 1);
  });

  test('fails open to the raw track outside AudioWorklet and disposes it once', async () => {
    let stops = 0;
    const rawTrack = {
      onended: null,
      getSettings: () => ({ deviceId: 'mic-1' }),
      stop: () => { stops += 1; },
    } as unknown as MediaStreamTrack;
    const rawStream = {
      getAudioTracks: () => [rawTrack],
      getTracks: () => [rawTrack],
    } as unknown as MediaStream;

    const pipeline = await createMicrophonePipeline(rawStream, 40);
    assert.equal(pipeline.track, rawTrack);
    assert.equal(pipeline.deviceId, 'mic-1');
    assert.equal(pipeline.gateAvailable, false);
    pipeline.setSensitivity(10);
    pipeline.dispose();
    pipeline.dispose();
    assert.equal(stops, 1);
  });
});

describe('nestwork noise gate AudioWorklet', () => {
  test('copies every sample faithfully when configured in bypass mode', () => {
    const processor = loadNoiseGateProcessor();
    configure(processor, null);
    const input = pseudoRandomSignal(RENDER_QUANTUM * 8, 0.37);
    assert.deepEqual(render(processor, input), input);
  });

  test('keeps silence closed and rejects a short loud transient', () => {
    const processor = loadNoiseGateProcessor();
    configure(processor, -40);

    const silence = new Float32Array(RENDER_QUANTUM * 8);
    assert.equal(peak(render(processor, silence)), 0);

    const transient = new Float32Array(RENDER_QUANTUM * 32);
    transient.set(pseudoRandomSignal(RENDER_QUANTUM, 0.7), RENDER_QUANTUM * 4);
    assert.ok(peak(render(processor, transient)) < 1e-6);
  });

  test('opens for sustained speech, preserves its onset with lookahead and releases smoothly', () => {
    const processor = loadNoiseGateProcessor();
    configure(processor, -40);

    const prerollLength = RENDER_QUANTUM * 8;
    const speechLength = RENDER_QUANTUM * 80;
    // The product deliberately keeps the gate open for 220 ms, then applies a
    // 160 ms exponential release. Feed enough sub-threshold material to observe
    // the whole fade instead of mistaking the hold period for a stuck gate.
    const releaseLength = RENDER_QUANTUM * 640;
    const tailLength = RENDER_QUANTUM * 80;
    const input = new Float32Array(prerollLength + speechLength + releaseLength + tailLength);
    input.set(pseudoRandomSignal(speechLength, 0.24), prerollLength);
    input.fill(0.004, prerollLength + speechLength, prerollLength + speechLength + releaseLength);

    const output = render(processor, input);
    assert.ok(peak(output) > 0.15, 'sustained speech must open the gate');

    const correlationStart = prerollLength + RENDER_QUANTUM * 24;
    const correlationLength = RENDER_QUANTUM * 8;
    let bestLag = 0;
    let bestCorrelation = Number.NEGATIVE_INFINITY;
    for (let lag = 0; lag <= RENDER_QUANTUM * 12; lag += 1) {
      const correlation = correlationAtLag(input, output, correlationStart, correlationLength, lag);
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    assert.ok(bestLag > 0, 'active gating must retain samples in a lookahead buffer');
    assert.ok(bestCorrelation > 0.95, 'the delayed speech waveform must remain faithful');

    const releaseStart = prerollLength + speechLength + bestLag;
    const releaseEnd = releaseStart + releaseLength;
    const releaseRms: number[] = [];
    for (let offset = releaseStart; offset + RENDER_QUANTUM <= releaseEnd; offset += RENDER_QUANTUM) {
      releaseRms.push(rms(output.subarray(offset, offset + RENDER_QUANTUM)));
    }
    const audibleReleaseBlocks = releaseRms.filter((level) => level > 1e-5);
    assert.ok(audibleReleaseBlocks.length > 1, 'release must not hard-cut the signal');
    assert.ok(releaseRms.slice(-8).every((level) => level < 1e-5), 'release must eventually close');

    const firstFadedBlock = releaseRms.findIndex((level) => level < 0.0035);
    const firstClosedBlock = releaseRms.findIndex((level) => level < 0.0005);
    assert.ok(firstFadedBlock >= 0 && firstClosedBlock > firstFadedBlock, 'gain must ramp down progressively');
  });
});
