/*
 * components/verse/MotifScene.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 구절 상세의 짧은 추상 연출.
 *
 * 원칙:
 *  - 성경의 상징을 추상적으로만 쓴다. 인물 형상이나 진부한 종교 그래픽은 없다.
 *  - 외부 이미지를 쓰지 않는다 (저작권 회피 + 용량 0).
 *  - reduced-motion 에서는 첫 프레임만 그리고 루프를 돌리지 않는다.
 *
 * 8종 모두 같은 팔레트(은백·달빛·온백) 안에서 움직인다.
 */

import { useEffect, useRef } from 'react';
import type { VisualMotif } from '../../data/types';
import { usePrefersReducedMotion } from '../../state/usePrefersReducedMotion';
import styles from './MotifScene.module.css';

/** 모티프별 표시 이름 — 화면과 스크린리더에 함께 쓴다. */
export const MOTIF_LABELS: Record<VisualMotif, string> = {
  light: '빛',
  water: '물결',
  wilderness: '광야',
  dawn: '새벽빛',
  path: '길',
  seed: '씨앗',
  mountain: '산',
  wind: '바람',
};

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

const WARM = '242, 233, 216';
const SILVER = '232, 236, 242';
const MOON = '205, 216, 230';

/**
 * 모티프별 그리기 함수.
 * t 는 경과 시간(초). 모두 t=0 에서도 의미가 통하는 정지 화면이 되도록 그린다
 * (reduced-motion 에서 한 프레임만 그려도 빈 화면이 되지 않게).
 */
const SCENES: Record<VisualMotif, DrawFn> = {
  // 빛 — 중심에서 번지는 동심원
  light: (ctx, w, h, t) => {
    const cx = w / 2;
    const cy = h * 0.55;
    for (let i = 0; i < 4; i += 1) {
      const phase = (t * 0.18 + i / 4) % 1;
      const r = phase * Math.min(w, h) * 0.75;
      const alpha = (1 - phase) * 0.22;
      ctx.strokeStyle = `rgba(${WARM}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  // 물결 — 겹쳐 흐르는 수평 사인파
  water: (ctx, w, h, t) => {
    for (let line = 0; line < 5; line += 1) {
      const y = h * (0.35 + line * 0.11);
      const amp = 5 + line * 1.6;
      const speed = 0.5 + line * 0.12;
      ctx.strokeStyle = `rgba(${MOON}, ${(0.3 - line * 0.045).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const yy = y + Math.sin(x * 0.018 + t * speed + line) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  },

  // 광야 — 낮게 깔린 능선과 흩날리는 모래
  wilderness: (ctx, w, h, t) => {
    ctx.strokeStyle = `rgba(${WARM}, 0.2)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 5) {
      const y = h * 0.72 + Math.sin(x * 0.01) * 8 + Math.sin(x * 0.031) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 53 + t * 34) % (w + 40)) - 20;
      const y = h * 0.5 + ((i * 37) % 40) + Math.sin(t * 0.9 + i) * 4;
      ctx.fillStyle = `rgba(${WARM}, ${(0.05 + (i % 5) * 0.02).toFixed(3)})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  },

  // 새벽빛 — 아래에서 차오르는 띠
  dawn: (ctx, w, h, t) => {
    const rise = (Math.sin(t * 0.4) + 1) / 2;
    const g = ctx.createLinearGradient(0, h, 0, h * (0.25 - rise * 0.1));
    g.addColorStop(0, `rgba(${WARM}, 0.24)`);
    g.addColorStop(0.5, `rgba(${WARM}, 0.07)`);
    g.addColorStop(1, `rgba(${WARM}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = `rgba(${SILVER}, 0.22)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    ctx.lineTo(w, h * 0.78);
    ctx.stroke();
  },

  // 길 — 소실점으로 좁아지는 두 선
  path: (ctx, w, h, t) => {
    const vanishX = w / 2 + Math.sin(t * 0.25) * 10;
    const vanishY = h * 0.3;
    ctx.strokeStyle = `rgba(${SILVER}, 0.26)`;
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + side * w * 0.34, h);
      ctx.lineTo(vanishX + side * 8, vanishY);
      ctx.stroke();
    }
    // 길 위를 지나가는 표식
    for (let i = 0; i < 6; i += 1) {
      const p = ((t * 0.16 + i / 6) % 1) ** 2;
      const y = vanishY + (h - vanishY) * p;
      const half = 4 + p * (w * 0.3);
      ctx.strokeStyle = `rgba(${SILVER}, ${(0.05 + p * 0.16).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(w / 2 - half * 0.12, y);
      ctx.lineTo(w / 2 + half * 0.12, y);
      ctx.stroke();
    }
  },

  // 씨앗 — 한 점에서 위로 자라는 선
  seed: (ctx, w, h, t) => {
    const cx = w / 2;
    const baseY = h * 0.82;
    const grow = (Math.sin(t * 0.35) + 1) / 2;
    const top = baseY - h * (0.25 + grow * 0.28);

    ctx.strokeStyle = `rgba(${SILVER}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.quadraticCurveTo(cx + Math.sin(t * 0.5) * 12, (baseY + top) / 2, cx, top);
    ctx.stroke();

    ctx.fillStyle = `rgba(${WARM}, 0.5)`;
    ctx.beginPath();
    ctx.arc(cx, baseY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  },

  // 산 — 겹친 능선
  mountain: (ctx, w, h, t) => {
    for (let layer = 0; layer < 3; layer += 1) {
      const baseY = h * (0.6 + layer * 0.09);
      const height = h * (0.3 - layer * 0.06);
      const drift = Math.sin(t * 0.15 + layer) * 6;
      ctx.strokeStyle = `rgba(${MOON}, ${(0.3 - layer * 0.08).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, baseY);
      ctx.lineTo(w * 0.3 + drift, baseY - height);
      ctx.lineTo(w * 0.52 + drift, baseY - height * 0.55);
      ctx.lineTo(w * 0.74 - drift, baseY - height * 0.88);
      ctx.lineTo(w + 10, baseY);
      ctx.stroke();
    }
  },

  // 바람 — 흘러가는 곡선 다발
  wind: (ctx, w, h, t) => {
    for (let i = 0; i < 7; i += 1) {
      const y = h * (0.28 + i * 0.075);
      const offset = ((t * 40 + i * 60) % (w + 200)) - 100;
      const len = 60 + (i % 3) * 34;
      ctx.strokeStyle = `rgba(${SILVER}, ${(0.26 - i * 0.026).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(offset, y);
      ctx.quadraticCurveTo(offset + len / 2, y - 10 + i * 2, offset + len, y);
      ctx.stroke();
    }
  },
};

interface Props {
  motif: VisualMotif;
}

export function MotifScene({ motif }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = SCENES[motif];
    let frame = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      // reduced-motion 은 t=0 한 프레임만 그린다.
      draw(ctx, w, h, reducedMotion ? 0 : (now - start) / 1000);
      if (!reducedMotion) frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(() => {
      resize();
      render(performance.now());
    });
    observer.observe(canvas);

    resize();
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [motif, reducedMotion]);

  return (
    <div className={styles.scene}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={`${MOTIF_LABELS[motif]}을(를) 형상화한 추상 연출`}
      />
    </div>
  );
}
