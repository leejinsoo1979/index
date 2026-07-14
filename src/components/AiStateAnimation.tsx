import { useEffect, useRef } from "react";

export type AiMode =
  | "analyze"
  | "think"
  | "connect"
  | "intense"
  | "deep"
  | "transfer";

export type AiShape = "circle" | "triangle" | "square" | "diamond" | "clean";

interface Dot {
  x: number;
  y: number;
  col: number;
  row: number;
  opacity: number;
  size: number;
  phase: number;
  speed: number;
}

interface AiStateAnimationProps {
  mode: AiMode;
  shape: AiShape;
}

export const modeColor: Record<AiMode, [number, number, number]> = {
  analyze: [96, 165, 250],
  think: [56, 189, 248],
  connect: [74, 222, 128],
  intense: [251, 146, 60],
  deep: [168, 85, 247],
  transfer: [244, 114, 182],
};

function drawShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: AiShape,
) {
  ctx.beginPath();

  if (shape === "circle") {
    ctx.arc(x, y, size, 0, Math.PI * 2);
  } else if (shape === "triangle") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size * 0.92, y + size * 0.58);
    ctx.lineTo(x + size * 0.92, y + size * 0.58);
    ctx.closePath();
  } else if (shape === "square") {
    ctx.rect(x - size, y - size, size * 2, size * 2);
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
  }

  ctx.fill();
}

function modeLabel(mode: AiMode) {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export function AiStateAnimation({ mode, shape }: AiStateAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const canvasEl = canvas;
    const ctx2 = ctx;

    let width = 0;
    let height = 0;
    let frame = 0;
    let dots: Dot[] = [];
    let startedAt = performance.now();

    function buildGrid() {
      const rect = canvasEl.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvasEl.width = width;
      canvasEl.height = height;

      const spacing = width < 760 ? 10 : 8;
      const cols = Math.ceil(width / spacing);
      const rows = Math.ceil(height / spacing);

      dots = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          dots.push({
            x: col * spacing + spacing / 2,
            y: row * spacing + spacing / 2,
            col,
            row,
            opacity: Math.random() * 0.3,
            size: Math.random() * 1.4 + 0.45,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.012 + 0.006,
          });
        }
      }
      startedAt = performance.now();
    }

    function drawBackground(color: [number, number, number], now: number) {
      const [r, g, b] = color;
      // Translucent tint instead of an opaque fill so the CSS space-background
      // image on .home shows through beneath the particles.
      ctx2.clearRect(0, 0, width, height);
      ctx2.fillStyle = "rgba(2, 4, 10, 0.45)";
      ctx2.fillRect(0, 0, width, height);

      const glow = ctx2.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.62,
      );
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.33)`);
      glow.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, 0.11)`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2.fillStyle = glow;
      ctx2.fillRect(0, 0, width, height);

      const sweep = ctx2.createLinearGradient(0, 0, width, height);
      const alpha = 0.05 + Math.sin(now * 0.001) * 0.025;
      sweep.addColorStop(0, "rgba(255,255,255,0)");
      sweep.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      sweep.addColorStop(1, "rgba(255,255,255,0)");
      ctx2.fillStyle = sweep;
      ctx2.fillRect(0, 0, width, height);
    }

    function intensityForMode(dot: Dot, now: number) {
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = dot.x - centerX;
      const dy = dot.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
      const elapsed = (now - startedAt) / 1000;

      if (mode === "analyze") {
        const wave = (elapsed * 230) % (maxDist + 180);
        return Math.max(0, 1 - Math.abs(dist - wave) / 58) * Math.max(0.15, 1 - dist / maxDist);
      }

      if (mode === "think") {
        const scan = (elapsed * 260) % (width + 220) - 110;
        const band = Math.max(0, 1 - Math.abs(dot.x - scan) / 80);
        const grid = Math.max(0, 1 - dist / (maxDist * 0.9));
        return band * 0.95 + grid * 0.16;
      }

      if (mode === "connect") {
        const scan = (elapsed * 180) % (width + 180) - 90;
        const band = Math.max(0, 1 - Math.abs(dot.x - scan) / 130);
        const lanes = Math.sin(dot.row * 0.56 + elapsed * 5) > 0.72 ? 0.45 : 0;
        return band * 0.82 + lanes;
      }

      if (mode === "intense") {
        const corners = [
          [0, height / 2],
          [width, height / 2],
          [width / 2, 0],
          [width / 2, height],
        ];
        return Math.max(
          ...corners.map(([x, y], index) => {
            const d = Math.hypot(dot.x - x, dot.y - y);
            const wave = ((elapsed * (index % 2 ? 300 : 250)) + index * 70) % (maxDist + 160);
            return Math.max(0, 1 - Math.abs(d - wave) / 48);
          }),
        );
      }

      if (mode === "deep") {
        const angle = Math.atan2(dy, dx);
        const spiral = Math.sin(dist * 0.036 - elapsed * 6 + angle * 4);
        const focus = Math.max(0, 1 - dist / (maxDist * 0.78));
        return Math.max(0, spiral) * 0.55 + focus * 0.72;
      }

      const path = (dot.x + dot.y + elapsed * 360) % (width * 0.9);
      const band = Math.max(0, 1 - Math.abs(path - width * 0.45) / 90);
      const streak = Math.sin((dot.x - dot.y) * 0.045 + elapsed * 7) > 0.88 ? 0.65 : 0;
      return band + streak;
    }

    function animate() {
      const now = performance.now();
      const color = modeColor[mode];
      drawBackground(color, now);

      if (shape !== "clean") {
        for (const dot of dots) {
          const intensity = Math.min(1, intensityForMode(dot, now));
          const twinkle = 0.18 + (Math.sin(now * dot.speed + dot.phase) + 1) * 0.18;
          const alpha = Math.min(1, 0.04 + twinkle + intensity * 0.82);
          const size = dot.size * (0.6 + intensity * 1.9);

          ctx2.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          drawShape(ctx2, dot.x, dot.y, size, shape);
        }

        if (mode === "think" || mode === "connect") {
          const [r, g, b] = color;
          ctx2.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.24)`;
          ctx2.lineWidth = 1;
          const step = mode === "think" ? 112 : 86;
          for (let y = step; y < height; y += step) {
            ctx2.beginPath();
            ctx2.moveTo(0, y);
            ctx2.lineTo(width, y);
            ctx2.stroke();
          }
        }
      }

      frame = requestAnimationFrame(animate);
    }

    buildGrid();
    animate();
    window.addEventListener("resize", buildGrid);

    return () => {
      window.removeEventListener("resize", buildGrid);
      cancelAnimationFrame(frame);
    };
  }, [mode, shape]);

  return <canvas ref={canvasRef} className="ai-state__canvas" aria-hidden="true" />;
}

interface AnimatedModeTextProps {
  text: string;
}

export function AnimatedModeText({ text }: AnimatedModeTextProps) {
  return (
    <span className="ai-state__text" key={text}>
      {text.split("").map((char, index) => (
        <span
          key={`${char}-${index}`}
          style={{ animationDelay: `${index * 32}ms` }}
        >
          {char === " " ? "\u00a0" : char}
        </span>
      ))}
    </span>
  );
}

export const aiModes: AiMode[] = [
  "analyze",
  "think",
  "connect",
  "intense",
  "deep",
  "transfer",
];

export const aiShapes: AiShape[] = ["clean", "circle", "triangle", "square", "diamond"];

export const aiShapeGlyph: Record<AiShape, string> = {
  circle: "○",
  triangle: "▲",
  square: "■",
  diamond: "◆",
  clean: "●",
};

export { modeLabel };
