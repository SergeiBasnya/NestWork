const SPEAKING_THRESHOLD = 0.045;

const noop = () => undefined;

export function attachVoiceActivityDetector(
  stream: MediaStream,
  setSpeaking: (speaking: boolean) => void,
): () => void {
  const track = stream.getAudioTracks()[0];
  if (!track) return noop;

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  try {
    const AudioContextClass = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    context = new AudioContextClass();
    source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let active = true;
    let lastSample = 0;
    const loop = (time: number) => {
      if (!active) return;
      frame = requestAnimationFrame(loop);
      if (time - lastSample < 40) return;
      lastSample = time;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const value = (sample - 128) / 128;
        sum += value * value;
      }
      setSpeaking(Math.sqrt(sum / data.length) > SPEAKING_THRESHOLD);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      source?.disconnect();
      void context?.close();
      setSpeaking(false);
    };
  } catch {
    // Voice activity is only a visual enhancement. Audio publication must keep
    // working when a browser refuses another AudioContext or a track is stale.
    try { source?.disconnect(); } catch { /* best-effort cleanup */ }
    if (context) void context.close().catch(() => undefined);
    setSpeaking(false);
    return noop;
  }
}
