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

interface Star {
  x: number;
  y: number;
  size: number;
  depth: number;
  phase: number;
  speed: number;
}

export default function LogoParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const canvasEl = canvas;

    let animationFrame = 0;
    let particles: Particle[] = [];
    let stars: Star[] = [];
    let textImageData: ImageData | null = null;
    let width = 0;
    let height = 0;
    let particleTarget = 0;
    let backgroundReady = false;
    let startedAt = performance.now();

    const background = new Image();
    background.src = "/space-background.png";
    background.onload = () => {
      backgroundReady = true;
    };

    function resizeCanvas() {
      const rect = canvasEl.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvasEl.width = width;
      canvasEl.height = height;
      particleTarget = Math.floor(
        14000 * Math.sqrt((width * height) / (1920 * 1080)),
      );
      stars = Array.from({ length: Math.floor(width < 768 ? 95 : 180) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.35,
        depth: Math.random() * 0.8 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.0009 + 0.00025,
      }));
      rebuildParticles();
    }

    function drawLogoMask() {
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const fontSize = Math.min(
        width * 0.34,
        height * 0.28,
        width < 768 ? 108 : 210,
      );
      ctx.font = `600 ${fontSize}px Chillax, Arial, sans-serif`;
      ctx.fillText("index", width / 2, height / 2);

      textImageData = ctx.getImageData(0, 0, width, height);
      ctx.clearRect(0, 0, width, height);
    }

    function createParticle(): Particle | null {
      if (!textImageData) return null;

      const data = textImageData.data;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        if (data[(y * width + x) * 4 + 3] > 128) {
          return {
            x: Math.random() * width,
            y:
              Math.random() > 0.5
                ? Math.random() * height
                : (Math.random() > 0.5 ? -0.25 : 1.25) * height,
            baseX: x,
            baseY: y,
            size: Math.random() * 1.7 + 0.65,
            phase: Math.random() * Math.PI * 2,
            depth: Math.random() * 0.75 + 0.45,
            delay: Math.random() * 520,
            hue: Math.random(),
          };
        }
      }

      return null;
    }

    function rebuildParticles() {
      drawLogoMask();
      particles = [];
      startedAt = performance.now();
      for (let i = 0; i < particleTarget; i += 1) {
        const particle = createParticle();
        if (particle) particles.push(particle);
      }
    }

    function drawBackground(now: number) {
      if (!ctx) return;

      if (backgroundReady) {
        ctx.drawImage(background, 0, 0, width, height);
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
      }

      const nebula = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        0,
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.62,
      );
      nebula.addColorStop(0, "rgba(34, 211, 238, 0.1)");
      nebula.addColorStop(0.44, "rgba(79, 107, 246, 0.06)");
      nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, width, height);

      for (const star of stars) {
        const twinkle = 0.35 + Math.sin(now * star.speed + star.phase) * 0.32;
        ctx.globalAlpha = Math.max(0.08, twinkle) * star.depth;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }
      ctx.globalAlpha = 1;
    }

    function animate() {
      if (!ctx) return;
      const now = performance.now();
      const elapsed = now - startedAt;

      drawBackground(now);

      const pointer = pointerRef.current;
      const maxDistance = width < 768 ? 150 : 230;
      const complete = elapsed > 1900;
      const pulse = complete ? 1 : 1 + Math.sin(now * 0.002) * 0.014;

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        const dx = pointer.x - particle.x;
        const dy = pointer.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        particle.phase += 0.1;
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
          const sparkle = 0.84 + Math.sin(now * 0.0022 + particle.phase) * 0.16;
          ctx.fillStyle =
            particle.hue > 0.96
              ? `rgba(125, 211, 252, ${0.72 + sparkle * 0.22})`
              : `rgba(255, 255, 255, ${0.72 + sparkle * 0.24})`;
        }

        const flickerSize =
          particle.size * (0.82 + Math.sin(now * 0.003 + particle.phase) * 0.16);
        ctx.fillRect(particle.x, particle.y, flickerSize, flickerSize);
      }

      animationFrame = requestAnimationFrame(animate);
    }

    function setPointer(x: number, y: number, active = true) {
      pointerRef.current = { x, y, active };
    }

    function handleMouseMove(event: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      setPointer(event.clientX - rect.left, event.clientY - rect.top);
    }

    function handleMouseLeave() {
      pointerRef.current.active = false;
    }

    function handleTouchMove(event: TouchEvent) {
      if (!event.touches.length) return;
      event.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      setPointer(
        event.touches[0].clientX - rect.left,
        event.touches[0].clientY - rect.top,
      );
    }

    function handleTouchEnd() {
      pointerRef.current.active = false;
    }

    async function start() {
      if ("fonts" in document) {
        await document.fonts.load("600 160px Chillax");
      }
      resizeCanvas();
      animate();
    }

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasEl);
    window.addEventListener("resize", resizeCanvas);
    canvasEl.addEventListener("mousemove", handleMouseMove);
    canvasEl.addEventListener("mouseleave", handleMouseLeave);
    canvasEl.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvasEl.addEventListener("touchend", handleTouchEnd);

    start();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      canvasEl.removeEventListener("mousemove", handleMouseMove);
      canvasEl.removeEventListener("mouseleave", handleMouseLeave);
      canvasEl.removeEventListener("touchmove", handleTouchMove);
      canvasEl.removeEventListener("touchend", handleTouchEnd);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="logo-particles"
      aria-label="Interactive index logo particle animation"
    />
  );
}
