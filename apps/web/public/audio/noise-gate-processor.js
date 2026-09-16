/* global AudioWorkletProcessor, registerProcessor, sampleRate */

const PROCESSOR_NAME = 'nestwork-noise-gate';
const SILENCE_DB = -160;
const HYSTERESIS_DB = 6;
const LOOKAHEAD_MS = 20;
const OPEN_CONFIRM_MS = 12;
const HOLD_MS = 220;
const ATTACK_MS = 5;
// This is an exponential time constant: the audible fade lasts roughly six
// times this value, so 25 ms yields a smooth ~150 ms tail after the hold.
const RELEASE_MS = 25;
const METER_INTERVAL_MS = 50;

function millisecondsToSamples(milliseconds) {
  return Math.max(1, Math.round(sampleRate * milliseconds / 1000));
}

function amplitudeToDb(amplitude) {
  return amplitude > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(amplitude)) : SILENCE_DB;
}

function smoothingCoefficient(milliseconds) {
  return Math.exp(-1 / millisecondsToSamples(milliseconds));
}

class NestworkNoiseGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.thresholdDb = null;
    this.gateOpen = true;
    this.disposed = false;
    this.gain = 1;
    this.aboveThresholdSamples = 0;
    this.belowThresholdSamples = 0;
    this.meterSquareSum = 0;
    this.meterSampleCount = 0;
    this.lookahead = new Float32Array(millisecondsToSamples(LOOKAHEAD_MS));
    this.lookaheadIndex = 0;
    this.openConfirmSamples = millisecondsToSamples(OPEN_CONFIRM_MS);
    this.holdSamples = millisecondsToSamples(HOLD_MS);
    this.meterIntervalSamples = millisecondsToSamples(METER_INTERVAL_MS);
    this.attackCoefficient = smoothingCoefficient(ATTACK_MS);
    this.releaseCoefficient = smoothingCoefficient(RELEASE_MS);

    this.configure(options?.processorOptions?.thresholdDb ?? null);
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'configure') this.configure(data.thresholdDb);
      if (data?.type === 'dispose') this.disposed = true;
    };
  }

  configure(thresholdDb) {
    const nextThreshold = thresholdDb === null
      ? null
      : Number.isFinite(thresholdDb) ? Math.min(0, Math.max(-100, thresholdDb)) : null;
    const wasBypassed = this.thresholdDb === null;
    this.thresholdDb = nextThreshold;

    if (nextThreshold === null) {
      this.gateOpen = true;
      this.gain = 1;
      this.aboveThresholdSamples = 0;
      this.belowThresholdSamples = 0;
      this.resetLookahead();
    } else if (wasBypassed) {
      // Entering gated mode starts closed. The lookahead retains the beginning
      // of a sustained voice while the detector rejects isolated transients.
      this.gateOpen = false;
      this.gain = 0;
      this.aboveThresholdSamples = 0;
      this.belowThresholdSamples = 0;
      this.resetLookahead();
    }
  }

  resetLookahead() {
    this.lookahead.fill(0);
    this.lookaheadIndex = 0;
  }

  updateGate(blockRms, frameCount) {
    if (this.thresholdDb === null) return;
    const levelDb = amplitudeToDb(blockRms);

    if (!this.gateOpen) {
      if (levelDb >= this.thresholdDb) {
        this.aboveThresholdSamples += frameCount;
        if (this.aboveThresholdSamples >= this.openConfirmSamples) {
          this.gateOpen = true;
          this.aboveThresholdSamples = 0;
          this.belowThresholdSamples = 0;
        }
      } else {
        this.aboveThresholdSamples = 0;
      }
      return;
    }

    if (levelDb <= this.thresholdDb - HYSTERESIS_DB) {
      this.belowThresholdSamples += frameCount;
      if (this.belowThresholdSamples >= this.holdSamples) {
        this.gateOpen = false;
        this.aboveThresholdSamples = 0;
        this.belowThresholdSamples = 0;
      }
    } else {
      this.belowThresholdSamples = 0;
    }
  }

  updateGain() {
    const target = this.gateOpen ? 1 : 0;
    const coefficient = target > this.gain ? this.attackCoefficient : this.releaseCoefficient;
    this.gain = target + coefficient * (this.gain - target);
    if (this.gain < 0.00001) this.gain = 0;
    if (this.gain > 0.99999) this.gain = 1;
    return this.gain;
  }

  publishMeterIfDue() {
    if (this.meterSampleCount < this.meterIntervalSamples) return;
    const rms = Math.sqrt(this.meterSquareSum / Math.max(1, this.meterSampleCount));
    this.port.postMessage({
      type: 'meter',
      levelDb: amplitudeToDb(rms),
      gateOpen: this.thresholdDb === null || this.gateOpen,
    });
    this.meterSquareSum = 0;
    this.meterSampleCount = 0;
  }

  process(inputs, outputs) {
    const outputChannels = outputs[0] ?? [];
    const output = outputChannels[0];
    if (!output) return !this.disposed;
    if (this.disposed) {
      outputChannels.forEach((channel) => channel.fill(0));
      return false;
    }

    const inputChannels = inputs[0] ?? [];
    let blockSquareSum = 0;
    for (let index = 0; index < output.length; index += 1) {
      let sample = 0;
      for (const channel of inputChannels) sample += channel[index] ?? 0;
      if (inputChannels.length > 1) sample /= inputChannels.length;
      blockSquareSum += sample * sample;
    }

    const blockRms = Math.sqrt(blockSquareSum / Math.max(1, output.length));
    this.meterSquareSum += blockSquareSum;
    this.meterSampleCount += output.length;
    this.updateGate(blockRms, output.length);

    if (this.thresholdDb === null) {
      for (let index = 0; index < output.length; index += 1) {
        let sample = 0;
        for (const channel of inputChannels) sample += channel[index] ?? 0;
        output[index] = inputChannels.length > 1 ? sample / inputChannels.length : sample;
      }
    } else {
      for (let index = 0; index < output.length; index += 1) {
        let sample = 0;
        for (const channel of inputChannels) sample += channel[index] ?? 0;
        if (inputChannels.length > 1) sample /= inputChannels.length;

        const delayedSample = this.lookahead[this.lookaheadIndex];
        this.lookahead[this.lookaheadIndex] = sample;
        this.lookaheadIndex = (this.lookaheadIndex + 1) % this.lookahead.length;
        output[index] = delayedSample * this.updateGain();
      }
    }

    // The node is explicitly mono, but copying protects against engines that
    // materialize more output channels despite outputChannelCount.
    for (let channelIndex = 1; channelIndex < outputChannels.length; channelIndex += 1) {
      outputChannels[channelIndex].set(output);
    }
    this.publishMeterIfDue();
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, NestworkNoiseGateProcessor);
