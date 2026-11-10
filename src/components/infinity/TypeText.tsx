/**
 * 타이핑 연출: a text element written out letter by letter, with a soft key click per letter. The click is
 * synthesised (a short filtered noise burst), so there is no sound file to load.
 */
import { useEffect, useState } from "react";
import { ElementBody } from "../flipbook/BookPageView";
import type { TextElement } from "../../lib/flipbooks";

const SOUND_KEY = "ib-sound";
export const typingSoundOn = () => localStorage.getItem(SOUND_KEY) !== "off";
export const setTypingSound = (on: boolean) => localStorage.setItem(SOUND_KEY, on ? "on" : "off");

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;
function click(heavy: boolean) {
  if (!typingSoundOn()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    if (!noise) {
      noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.04), audio.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    const source = audio.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 0.85 + Math.random() * 0.3;
    const band = audio.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = heavy ? 1400 : 2600 + Math.random() * 900;
    band.Q.value = 1.4;
    const gain = audio.createGain();
    const now = audio.currentTime;
    gain.gain.setValueAtTime(heavy ? 0.5 : 0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    source.connect(band).connect(gain).connect(audio.destination);
    source.start(now);
  } catch {
    // No audio (blocked or unsupported): the text still types.
  }
}

export function TypeText({ element, still }: { element: TextElement; still: boolean }) {
  const letters = Array.from(element.text);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [count, setCount] = useState(reduced ? letters.length : 0);
  useEffect(() => {
    if (reduced) return;
    let shown = 0;
    let timer = 0;
    const tick = () => {
      shown += 1;
      setCount(shown);
      const letter = letters[shown - 1];
      if (letter && letter.trim()) click(letter === "\n" || /[.,·—]/.test(letter));
      if (shown < letters.length) timer = window.setTimeout(tick, (letter === "\n" ? 220 : 42) + Math.random() * 46);
    };
    timer = window.setTimeout(tick, (element.delay ?? 0) * 1000 + 250);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const done = count >= letters.length;
  return (
    <div className={`ib-type${done ? "" : " is-typing"}`}>
      {/* The full text holds the layout; the typed part is drawn over it. */}
      <div className="ib-type__ghost" aria-hidden="true"><ElementBody element={element} still={still} /></div>
      <div className="ib-type__live"><ElementBody element={{ ...element, text: letters.slice(0, count).join("") }} still={still} /></div>
    </div>
  );
}
