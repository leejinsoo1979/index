'use client';

import { useEffect, useRef } from 'react';

/**
 * 레퍼런스(v0-jarvis) 히어로 constellation 재현.
 * 핵심 특징: 블루 라인/도트, 클러스터(군집) 분포, 허브 노드의 화이트 코어 + 블루 글로우.
 */
export function HeroNetwork({ dark = true }: { dark?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      hub: boolean;
      cluster: number;
    };
    let particles: Particle[] = [];

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const LINK_DIST = 95;

    function gauss() {
      // Box-Muller 근사
      return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = width * DPR;
      canvas!.height = height * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      // 우측 편향 클러스터 중심 생성 → 별자리처럼 패치 단위로 뭉친다
      const clusterCount = Math.max(7, Math.floor(width / 180));
      const centers = Array.from({ length: clusterCount }, () => ({
        x: width * (0.35 + Math.random() * 0.68),
        y: height * (0.02 + Math.random() * 0.96),
        spread: 70 + Math.random() * 120,
      }));

      const total = Math.min(Math.floor((width * height) / 2800), 480);
      particles = Array.from({ length: total }, (_, i) => {
        const ci = i % centers.length;
        const c = centers[ci]!;
        return {
          x: c.x + gauss() * c.spread,
          y: c.y + gauss() * c.spread,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          r: 0.8 + Math.random() * 1.2,
          hub: Math.random() < 0.045,
          cluster: ci,
        };
      });
    }

    function tick() {
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      }

      // 블랙&화이트 테마: 다크=화이트 라인, 라이트=블랙 라인
      const line = darkRef.current ? '255, 255, 255' : '24, 24, 27';
      const dot = darkRef.current ? 'rgba(255, 255, 255, 0.75)' : 'rgba(24, 24, 27, 0.7)';
      const coreColor = darkRef.current ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';

      ctx!.lineWidth = 0.7;
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i]!;
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j]!;
          const dx = a.x - b.x;
          if (dx > LINK_DIST || dx < -LINK_DIST) continue;
          const dy = a.y - b.y;
          if (dy > LINK_DIST || dy < -LINK_DIST) continue;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > LINK_DIST) continue;
          const alpha = (1 - dist / LINK_DIST) * (darkRef.current ? 0.4 : 0.3);
          ctx!.strokeStyle = `rgba(${line}, ${alpha})`;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }

      // 도트: 블루 소형 + 허브(화이트 코어 + 블루 글로우 헤일로)
      for (const p of particles) {
        if (p.hub) {
          const glow = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
          glow.addColorStop(0, `rgba(${line}, 0.7)`);
          glow.addColorStop(0.25, `rgba(${line}, 0.25)`);
          glow.addColorStop(1, `rgba(${line}, 0)`);
          ctx!.fillStyle = glow;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx!.fill();

          ctx!.fillStyle = coreColor;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.fillStyle = dot;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    tick();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full [mask-image:linear-gradient(to_right,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.55)_30%,black_55%)]"
    />
  );
}
