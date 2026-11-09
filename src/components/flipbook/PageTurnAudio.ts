import type { BookTurnSound } from "../../lib/book-reader";

export const PAGE_TURN_RECORDING = "/book-audio/dragon-studio-flipping-book-page-499646.mp3";
let recording: Promise<ArrayBuffer> | null = null;

function loadRecording(): Promise<ArrayBuffer> {
  recording ??= fetch(PAGE_TURN_RECORDING).then(response => {
    if (!response.ok) throw new Error("Page-turn recording unavailable");
    return response.arrayBuffer();
  }).catch(error => { recording = null; throw error; });
  return recording;
}

/** The supplied recording, played once per turn. Preloading never starts audio. */
export class PageTurnAudio {
  private context: AudioContext | null = null;
  private buffer: Promise<AudioBuffer> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private disposed = false;
  private generation = 0;

  static preload() { void loadRecording().catch(() => {}); }

  async play(kind: BookTurnSound, volume: number, maxWaitMs = Infinity): Promise<boolean> {
    this.stop();
    const level = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (kind === "none" || level === 0 || this.disposed) return true;
    const request = this.generation;
    const requestedAt = performance.now();
    try {
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return false;
      this.context ??= new Context();
      const context = this.context;
      // Resume directly in the click/key gesture, before awaiting network or decoding.
      const resumed = context.state === "suspended" ? context.resume() : Promise.resolve();
      this.buffer ??= loadRecording().then(data => context.decodeAudioData(data.slice(0))).catch(error => {
        this.buffer = null;
        throw error;
      });
      const [, buffer] = await Promise.all([resumed, this.buffer]);
      if (this.disposed || request !== this.generation) return true;
      if (context.state !== "running" || performance.now() - requestedAt > maxWaitMs) return false;

      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      // Keep the recording's original timing and pitch. Quiet mode only lowers the level.
      gain.gain.value = level * (kind === "soft" ? .45 : 1);
      source.connect(gain).connect(context.destination);
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
      return true;
    } catch { return false; }
  }

  stop() {
    this.generation++;
    for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } }
    this.sources.clear();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    if (this.context) { void this.context.close().catch(() => {}); this.context = null; }
  }
}
