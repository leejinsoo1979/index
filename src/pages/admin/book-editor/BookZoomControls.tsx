import { FiMaximize } from "react-icons/fi";
import { CustomSelect } from "../../../components/ui/custom-select";

export default function BookZoomControls({ zoom, fitScale, onChange }: { zoom: string; fitScale: number; onChange: (value: string) => void }) {
  return <>
    <button type="button" className="be-btn be-btn--line be-fit" title="현재 페이지 또는 펼침면 전체 보기" aria-pressed={zoom === "fit"} onClick={() => onChange("fit")}><FiMaximize />화면 맞춤</button>
    <div className="be-zoom"><CustomSelect aria-label="화면 배율" value={zoom} onValueChange={onChange} options={[
      { value: "fit", label: `화면 맞춤 · ${Math.round(fitScale * 100)}%` },
      { value: "50", label: "50%" },
      { value: "75", label: "75%" },
      { value: "100", label: "100% · 원본 크기" },
      { value: "150", label: "150%" },
      { value: "200", label: "200%" },
    ]} /></div>
  </>;
}
