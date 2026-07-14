import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  phase: number;
  depth: number;
  delay: number;
  hue: number;
}

interface ParticleTitleProps {
  /** Text rendered as interactive particles (re-targets on change). */
  text: string;
  className?: string;
}

/**
 * Draws `text` as a cloud of particles that scatter away from the pointer
 * (same interaction as the deployed 인덱스.kr logo) on a transparent canvas.
 */
export default function ParticleTitle({ text, className }: ParticleTitleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });
  const textRef = useRef(text);
  const morphRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const canvasEl = canvas;

    let animationFrame = 0;
    let particles: Particle[] = [];
    let textImageData: ImageData | null = null;
    let width = 0;
    let height = 0;
    let particleTarget = 0;
    let startedAt = performance.now();

    function drawTextMask() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      /* wordmark width ≈ font-size × 2.67 — match the composer, min(640px, 86vw) */
      const fontSize = Math.min(240, width * 0.322);
      ctx.font = `600 ${fontSize}px Chillax, Arial, sans-serif`;
      ctx.fillText(textRef.current, width / 2, height / 2);
      textImageData = ctx.getImageData(0, 0, width, height);
      ctx.clearRect(0, 0, width, height);
    }

    function sampleTextPoint(): { x: number; y: number } | null {
      if (!textImageData) return null;
      const data = textImageData.data;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        if (data[(y * width + x) * 4 + 3] > 128) return { x, y };
      }
      return null;
    }

    function createParticle(): Particle | null {
      const point = sampleTextPoint();
      if (!point) return null;
      return {
        x: Math.random() * width,
        y:
          Math.random() > 0.5
            ? Math.random() * height
            : (Math.random() > 0.5 ? -0.25 : 1.25) * height,
        baseX: point.x,
        baseY: point.y,
        size: Math.random() * 1.7 + 0.65,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random() * 0.75 + 0.45,
        delay: Math.random() * 520,
        hue: Math.random(),
      };
    }

    function rebuildParticles() {
      drawTextMask();
      particles = [];
      startedAt = performance.now();
      for (let i = 0; i < particleTarget; i += 1) {
        const particle = createParticle();
        if (particle) particles.push(particle);
      }
    }

    /** Re-target existing particles to the new text so mode changes morph. */
    function morphParticles() {
      drawTextMask();
      const survivors: Particle[] = [];
      for (const particle of particles) {
        const point = sampleTextPoint();
        if (!point) continue;
        particle.baseX = point.x;
        particle.baseY = point.y;
        particle.delay = 0;
        survivors.push(particle);
      }
      particles = survivors;
      while (particles.length < particleTarget) {
        const particle = createParticle();
        if (!particle) break;
        particle.x = width / 2;
        particle.y = height / 2;
        particle.delay = 0;
        particles.push(particle);
      }
    }
    morphRef.current = morphParticles;

    function resizeCanvas() {
      const rect = canvasEl.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvasEl.width = width;
      canvasEl.height = height;
      particleTarget = Math.floor(
        9000 * Math.sqrt((width * height) / (1920 * 1080)),
      );
      rebuildParticles();
    }

    function animate() {
      if (!ctx) return;
      const now = performance.now();
      const elapsed = now - startedAt;

      ctx.clearRect(0, 0, width, height);

      const pointer = pointerRef.current;
      const maxDistance = width < 768 ? 150 : 230;
      const complete = elapsed > 1900;
      const pulse = complete ? 1 : 1 + Math.sin(now * 0.002) * 0.014;

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        const dx = pointer.x - particle.x;
        const dy = pointer.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        particle.phase += 0.03;
        const intro = Math.min(1, Math.max(0, (elapsed - particle.delay) / 980));
        const easedIntro = 1 - Math.pow(1 - intro, 3);
        const driftX = complete
          ? 0
          : Math.sin(now * 0.0014 + particle.phase) * 1.25 * particle.depth;
        const driftY = complete
          ? 0
          : Math.cos(now * 0.0011 + particle.phase * 1.3) * 0.9 * particle.depth;
        const targetX = width / 2 + (particle.baseX - width / 2) * pulse + driftX;
        const targetY = height / 2 + (particle.baseY - height / 2) * pulse + driftY;

        if (pointer.active && distance < maxDistance) {
          const force = (maxDistance - distance) / maxDistance;
          const angle = Math.atan2(dy, dx);
          particle.x = targetX - Math.cos(angle) * force * 82;
          particle.y = targetY - Math.sin(angle) * force * 82;

          const shimmer = (Math.sin(particle.phase) + 1) / 2;
          if (Math.sin(particle.phase * 2) > 0) {
            const blue = Math.floor(135 + shimmer * 120);
            ctx.fillStyle = `rgb(${Math.floor(blue * 0.6)}, ${Math.floor(
              blue * 0.8,
            )}, ${blue})`;
          } else {
            const white = Math.floor(200 + shimmer * 55);
            ctx.fillStyle = `rgb(${white}, ${white}, ${white})`;
          }
        } else {
          const settleSpeed = complete ? 0.18 : 0.055 + easedIntro * 0.13;
          particle.x += (targetX - particle.x) * settleSpeed;
          particle.y += (targetY - particle.y) * settleSpeed;
          const sparkle = 0.84 + Math.sin(now * 0.0011 + particle.phase) * 0.16;
          ctx.fillStyle =
            particle.hue > 0.96
              ? `rgba(125, 211, 252, ${0.72 + sparkle * 0.22})`
              : `rgba(255, 255, 255, ${0.72 + sparkle * 0.24})`;
        }

        const flickerSize =
          particle.size * (0.82 + Math.sin(now * 0.0014 + particle.phase) * 0.16);
        ctx.fillRect(particle.x, particle.y, flickerSize, flickerSize);
      }

      animationFrame = requestAnimationFrame(animate);
    }

    // Pointer tracked on window so the canvas never blocks clicks below it.
    function handleMouseMove(event: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointerRef.current = {
        x,
        y,
        active: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      if (!event.touches.length) return;
      const rect = canvasEl.getBoundingClientRect();
      pointerRef.current = {
        x: event.touches[0].clientX - rect.left,
        y: event.touches[0].clientY - rect.top,
        active: true,
      };
    }

    function handlePointerEnd() {
      pointerRef.current.active = false;
    }

    async function start() {
      if ("fonts" in document) {
        try {
          await document.fonts.load("600 195px Chillax");
        } catch {
          // fall back to whatever font resolves
        }
      }
      resizeCanvas();
      animate();
    }

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasEl);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handlePointerEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handlePointerEnd);

    void start();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handlePointerEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerEnd);
      cancelAnimationFrame(animationFrame);
      morphRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (textRef.current === text) return;
    textRef.current = text;
    morphRef.current?.();
  }, [text]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={text}
    />
  );
}
