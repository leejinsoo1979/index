import { useEffect, useState } from "react";
import { FiPlay } from "react-icons/fi";
import { CustomSelect } from "../ui/custom-select";
import { BOOK_TURN_EFFECTS, BOOK_TURN_SOUNDS, type BookReaderSettings, type BookTurnEffect, type BookTurnSound } from "../../lib/book-reader";
import { PageTurnAudio } from "./PageTurnAudio";
import "./BookReaderOptions.css";

export default function BookReaderOptions({ value, onChange, onListen }: { value: BookReaderSettings; onChange: (patch: Partial<BookReaderSettings>) => void; onListen: () => Promise<boolean> }) {
  const [audioError, setAudioError] = useState(false);
  useEffect(() => PageTurnAudio.preload(), []);
  return <div className="br-options">
    <label className="br-options__field"><span>넘김 효과</span><CustomSelect aria-label="넘김 효과" value={value.effect} options={BOOK_TURN_EFFECTS} onValueChange={effect => onChange({ effect: effect as BookTurnEffect })} /></label>
    <label className="br-options__field"><span>넘김 속도</span><CustomSelect aria-label="넘김 속도" value={String(value.duration)} options={[{ value: "400", label: "빠르게" }, { value: "650", label: "보통" }, { value: "1000", label: "여유롭게" }, ...(![400, 650, 1000].includes(value.duration) ? [{ value: String(value.duration), label: `${value.duration}ms` }] : [])]} onValueChange={duration => onChange({ duration: Number(duration) })} /></label>
    <label className="br-options__field"><span>넘김 소리</span><CustomSelect aria-label="넘김 소리" value={value.sound} options={BOOK_TURN_SOUNDS} onValueChange={sound => { setAudioError(false); onChange({ sound: sound as BookTurnSound }); }} /></label>
    <label className="br-options__volume"><span>음량 <output>{Math.round(value.volume * 100)}%</output></span><input type="range" aria-label="넘김 소리 음량" min="0" max="100" step="5" value={Math.round(value.volume * 100)} disabled={value.sound === "none"} onChange={event => onChange({ volume: Number(event.target.value) / 100 })} /></label>
    <button type="button" className="br-options__listen" disabled={value.sound === "none" || value.volume === 0} onClick={() => { void onListen().then(ok => setAudioError(!ok)); }}><FiPlay />소리 들어보기</button>
    {audioError && <p className="br-options__error" role="status">소리를 재생하지 못했습니다. 브라우저의 소리 설정을 확인해 주세요.</p>}
  </div>;
}
