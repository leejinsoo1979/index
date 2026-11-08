/** Dev-only gallery of the nine thinking orbs on light and dark surfaces (/orbs-preview.html). */
import ReactDOM from "react-dom/client";
import ThinkingOrb, { ORB_LABEL, ThinkingOrbLabel } from "./ThinkingOrb";
import type { OrbDesign } from "./orbEngine";

const DESIGNS = Object.keys(ORB_LABEL) as OrbDesign[];

function Panel({ dark }: { dark: boolean }) {
  return (
    <section style={{ background: dark ? "#0b0b0d" : "#ffffff", color: dark ? "#f4f4f5" : "#111827", padding: 28, fontFamily: "Pretendard, sans-serif" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 12 }}>
        {DESIGNS.map((d) => (
          <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <ThinkingOrb design={d} />
            <ThinkingOrb design={d} size="small" />
            <small style={{ opacity: 0.7 }}>{d}</small>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22 }}>
        <ThinkingOrbLabel design="composing">답변을 준비하는 중…</ThinkingOrbLabel>
      </div>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <Panel dark={false} />
    <Panel dark />
  </>,
);
