import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChatComposer,
  ChatComposerInput,
  ChatDictationButton,
  useChatDictation,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import {
  AiStateAnimation,
  AnimatedModeText,
  aiModes,
  aiShapeGlyph,
  aiShapes,
  modeLabel,
  type AiMode,
  type AiShape,
} from "../components/AiStateAnimation";
import "./Home.css";

export default function Home() {
  const [mode, setMode] = useState<AiMode>("analyze");
  const [shape, setShape] = useState<AiShape>("circle");
  const modeAudioRef = useRef<HTMLAudioElement>(null);
  const shapeAudioRef = useRef<HTMLAudioElement>(null);
  const [message, setMessage] = useState("");
  const composerInputRef = useRef<ChatComposerInputHandle | null>(null);
  const dictation = useChatDictation({
    inputRef: composerInputRef,
    hasSounds: true,
  });

  useEffect(() => {
    if (modeAudioRef.current) modeAudioRef.current.volume = 0.45;
    if (shapeAudioRef.current) shapeAudioRef.current.volume = 0.45;
  }, []);

  function playAudio(audio: HTMLAudioElement | null) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Browsers can block audio until a user gesture has occurred.
    });
  }

  function handleModeChange(item: AiMode) {
    setMode(item);
    playAudio(modeAudioRef.current);
  }

  function handleShapeChange(item: AiShape) {
    setShape(item);
    playAudio(shapeAudioRef.current);
  }

  return (
    <section className="home">
      <audio
        ref={modeAudioRef}
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/animation-menu-SBSEhsCLzhfXdw8sBI16r613N8tkGr.mp3"
        preload="auto"
      />
      <audio
        ref={shapeAudioRef}
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/select-forms-Y6f2sUOHatrkKO1eoSZpRtMTCUUzTD.mp3"
        preload="auto"
      />
      <AiStateAnimation mode={mode} shape={shape} />
      <div className="home__hero">
        <h1 className="home__mode-title">
          <AnimatedModeText text={modeLabel(mode)} />
        </h1>
      </div>

      <div className="home__composer">
        <Theme theme={neutralTheme} mode="dark">
          <ChatComposer
            onSubmit={() => setMessage("")}
            placeholder="Type a message..."
            input={
              <ChatComposerInput
                handleRef={composerInputRef}
                value={message}
                onChange={setMessage}
                placeholder="Type a message..."
              />
            }
            sendActions={<ChatDictationButton dictation={dictation} />}
          />
        </Theme>
      </div>

      <Link to="/mypage" className="home__start">
        Start
      </Link>

      <div className="home__controls" aria-label="AI animation controls">
        <div className="home__shape-tabs" role="tablist" aria-label="Particle shape">
          {aiShapes.map((item) => (
            <button
              key={item}
              type="button"
              className={"home__control" + (shape === item ? " is-active" : "")}
              onClick={() => handleShapeChange(item)}
              aria-pressed={shape === item}
            >
              {aiShapeGlyph[item]}
            </button>
          ))}
        </div>

        <div className="home__mode-tabs" role="tablist" aria-label="Animation mode">
          {aiModes.map((item) => (
            <button
              key={item}
              type="button"
              className={"home__mode" + (mode === item ? " is-active" : "")}
              onClick={() => handleModeChange(item)}
              aria-pressed={mode === item}
            >
              {modeLabel(item)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
