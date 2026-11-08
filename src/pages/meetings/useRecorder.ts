import { useCallback, useEffect, useRef, useState } from "react";

export type RecordSource = "mic" | "online";
export type RecorderState = "idle" | "recording" | "paused" | "done";

const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Browser meeting recorder. "mic" records the microphone; "online" mixes the microphone with the
 * audio of a shared tab/window (Zoom·Meet in Chrome: pick the tab and tick "탭 오디오 공유").
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<number>(0);
  const raf = useRef<number>(0);
  const startedAt = useRef(0);
  const carried = useRef(0);

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current);
    cancelAnimationFrame(raf.current);
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Leaving the page mid-recording loses the audio.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const start = useCallback(
    async (source: RecordSource) => {
      setError("");
      setBlob(null);
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        streams.current.push(mic);
        const audio = new AudioContext();
        ctx.current = audio;
        const dest = audio.createMediaStreamDestination();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(mic).connect(dest);
        audio.createMediaStreamSource(mic).connect(analyser);
        if (source === "online") {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          streams.current.push(display);
          if (!display.getAudioTracks().length) {
            cleanup();
            setError("공유한 화면에 소리가 없습니다. 회의 탭을 고르고 '탭 오디오도 공유'를 켜 주세요.");
            return;
          }
          display.getVideoTracks().forEach((t) => t.stop());
          const remote = audio.createMediaStreamSource(new MediaStream(display.getAudioTracks()));
          remote.connect(dest);
          remote.connect(analyser);
        }
        const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
        const recorder = new MediaRecorder(dest.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => {
          setBlob(new Blob(chunks, { type: (recorder.mimeType || "audio/webm").split(";")[0] }));
          setState("done");
          cleanup();
        };
        recorder.start(1000);
        rec.current = recorder;
        carried.current = 0;
        startedAt.current = Date.now();
        setElapsed(0);
        setState("recording");
        timer.current = window.setInterval(() => setElapsed(carried.current + (Date.now() - startedAt.current) / 1000), 500);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        cleanup();
        const name = (e as DOMException).name;
        setError(name === "NotAllowedError" ? "마이크(또는 화면 공유) 권한이 필요합니다. 브라우저 주소창의 권한 설정을 확인해 주세요." : "녹음을 시작하지 못했습니다.");
      }
    },
    [cleanup],
  );

  const pause = useCallback(() => {
    const r = rec.current;
    if (!r || r.state !== "recording") return;
    r.pause();
    carried.current += (Date.now() - startedAt.current) / 1000;
    window.clearInterval(timer.current);
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    const r = rec.current;
    if (!r || r.state !== "paused") return;
    r.resume();
    startedAt.current = Date.now();
    timer.current = window.setInterval(() => setElapsed(carried.current + (Date.now() - startedAt.current) / 1000), 500);
    setState("recording");
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
    window.clearInterval(timer.current);
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setElapsed(0);
    setState("idle");
  }, []);

  return { state, elapsed, level, blob, error, start, pause, resume, stop, reset };
}
