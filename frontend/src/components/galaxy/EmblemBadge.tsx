/*
 * components/galaxy/EmblemBadge.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 조우한 은하의 표식. 팝업 왼쪽 위에서 천천히 돈다.
 *
 * ★ 왜 팝업에도 있어야 하나
 *   조우 화면에서 별이 상징으로 모이고 한 줄이 지나간 다음 팝업이 열린다.
 *   그런데 팝업에는 그 흔적이 하나도 없어서, 방금 만난 사람과 지금 읽는
 *   화면이 이어지지 않았다. 작은 상징 하나면 "여기가 그 사람의 자리" 가
 *   계속 남는다.
 *
 * ★ 캔버스 하나를 스스로 돌린다
 *   은하 엔진을 다시 띄우지 않는다. 상징 좌표(수백 개)를 옮겨 찍는 것뿐이라
 *   프레임당 비용이 거의 없다. 창이 닫히면 루프도 함께 멈춘다.
 */

import { useEffect, useRef } from 'react';
import { galaxyLabel, galaxySwatch, getGalaxy } from '../../data/disciples';
import { emblemOf } from '../../data/emblems';
import { badgeAngle, spinEmblem } from '../../galaxy/emblemSpin';
import { usePrefersReducedMotion } from '../../state/usePrefersReducedMotion';
import styles from './EmblemBadge.module.css';

interface Props {
  galaxyId: string | null | undefined;
  /** 캔버스 한 변(px). CSS 픽셀 기준. */
  size?: number;
}

const DEFAULT_SIZE = 56;
const MAX_DPR = 2;

export function EmblemBadge({ galaxyId, size = DEFAULT_SIZE }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const galaxy = galaxyId ? getGalaxy(galaxyId) : undefined;
  const emblem = galaxyId ? emblemOf(galaxyId) : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !emblem || !galaxy) return;

    const ctx = canvas.getContext('2d');
    // Canvas 를 못 쓰는 환경에서는 이름만 남는다 — 조용히 물러난다.
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const [r, g, b] = [1, 3, 5].map((i) => parseInt(galaxySwatch(galaxy).slice(i, i + 2), 16));

    let frame = 0;
    const started = performance.now();

    const draw = (now: number) => {
      const angle = badgeAngle((now - started) / 1000, reducedMotion);
      const points = spinEmblem(emblem, angle);

      ctx.clearRect(0, 0, size, size);

      for (const p of points) {
        /*
         * 뒤로 간 점은 작고 어둡다.
         * 이 차이가 없으면 앞뒤가 겹쳐 보여서, 도는 게 아니라 형태가
         * 흔들리는 것으로 읽힌다.
         */
        const near = 0.45 + p.depth * 0.55;
        const radius = (p.outline ? 1.15 : 0.7) * near;
        const alpha = (p.outline ? 0.95 : 0.4) * near;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x * size, p.y * size, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [emblem, galaxy, size, reducedMotion]);

  if (!galaxy || !emblem) return null;

  return (
    <div className={styles.badge}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: size, height: size }}
        /*
         * 장식이 아니라 정보다 — 어느 은하에 있는지 알린다.
         * 다만 옆에 같은 내용이 글로 있으므로 캔버스는 숨기고 글만 읽힌다.
         */
        aria-hidden="true"
      />
      <p className={styles.label}>
        <span className={styles.name}>{galaxyLabel(galaxy)}</span>
        <span className={styles.symbol}>{emblem.symbol}</span>
      </p>
    </div>
  );
}
