import { useEffect, useRef } from "react";
import { ORB_SIZE, orbFrame, type OrbDesign, type OrbSize } from "./orbEngine";
import "./ThinkingOrb.css";

/**
 * Dotted 3D "thinking" indicator (ported ThinkingOrbs, MIT). One canvas, grayscale dots only, so it
 * sits quietly on light and dark surfaces: the ink follows the surrounding text colour (light text →
 * light dots). Pauses offscreen, stays in phase with other orbs, and shows a still frame under
 * prefers-reduced-motion.
 *
 *   <ThinkingOrb design="searching" />            64px
 *   <ThinkingOrb design="composing" size="small" /> 20px, next to text
 *   <ThinkingOrbLabel design="searching">위키에서 찾는 중…</ThinkingOrbLabel>
 */
export const ORB_LABEL: Record<OrbDesign, string> = {
  working: "처리 중",
  searching: "찾는 중",
  solving: "분석 중",
  listening: "듣는 중",
  connecting: "연결 중",
  weaving: "계획 중",
  composing: "답변 작성 중",
  breathing: "생각 중",
  shaping: "만드는 중",
};

// One shared clock keeps every orb on the page in phase.
const T0 = typeof performance !== "undefined" ? performance.now() : 0;

function inkIsLight(el: HTMLElement) {
  const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
  if (!m) return false;
  const [r, g, b] = m.map(Number) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

type Props = {
  design?: OrbDesign;
  size?: OrbSize;
  /** draw at this pixel diameter instead of the size's native 64 / 20 */
  diameter?: number;
  className?: string;
  /** accessible label; defaults to the design's Korean status */
  label?: string;
};

export default function ThinkingOrb({ design = "breathing", size = "regular", diameter, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = diameter ?? ORB_SIZE[size];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    const unit = ORB_SIZE[size];
    const scale = (px / unit) * dpr;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let light = inkIsLight(canvas);
    let frame = 0;
    let visible = true;

    const ink = (white: number) => {
      const w = Math.min(1, Math.max(0, white));
      const v = Math.round((light ? 1 - w : w) * 255);
      return `rgb(${v},${v},${v})`;
    };
    const draw = (seconds: number) => {
      const f = orbFrame(design, size, seconds);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, unit, unit);
      for (const l of f.lines) {
        ctx.globalAlpha = l.a;
        ctx.strokeStyle = ink(l.white);
        ctx.lineWidth = l.w;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
      }
      for (const d of f.dots) {
        ctx.globalAlpha = Math.min(1, d.a);
        ctx.fillStyle = ink(d.white);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (visible) draw((now - T0) / 1000);
    };

    // theme changes (dark-mode toggle) flip the ink
    const themeWatch = new MutationObserver(() => {
      light = inkIsLight(canvas);
      if (reduce) draw(0.6);
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-app-theme", "data-theme"] });

    if (reduce) {
      draw(0.6);
      return () => themeWatch.disconnect();
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    });
    io.observe(canvas);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      themeWatch.disconnect();
    };
  }, [design, size, px]);

  return (
    <canvas
      ref={ref}
      className={`thinking-orb${className ? ` ${className}` : ""}`}
      style={{ width: px, height: px }}
      role={label === "" ? undefined : "img"}
      aria-hidden={label === "" ? true : undefined}
      aria-label={label === "" ? undefined : label ?? `${ORB_LABEL[design]}…`}
    />
  );
}

/** Small orb + status text, for inline "searching…" / "writing…" rows. */
export function ThinkingOrbLabel({ design = "breathing", children, className }: { design?: OrbDesign; children?: React.ReactNode; className?: string }) {
  return (
    <span className={`thinking-orb-label${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      <ThinkingOrb design={design} size="small" label="" />
      <span>{children ?? `${ORB_LABEL[design]}…`}</span>
    </span>
  );
}
