/*
 * galaxy/palette.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하 색온도.
 *
 * 팔레트 원칙은 그대로다 — 유채색은 "빛"을 표현할 때만, 아주 미세하게.
 * 실제 은하가 그렇듯 중심부는 따뜻하고(오래된 별) 외곽은 차갑다(젊은 별).
 * 여기서는 그 대비를 아주 얕게만 흉내낸다. 채도가 올라가면 즉시 촌스러워진다.
 *
 * 성능: 입자마다 색 문자열을 만들면 수천 번의 문자열 할당이 발생한다.
 * 그래서 색을 버킷으로 양자화하고, 렌더 루프는 버킷 단위로 묶어 그린다.
 * (fillStyle 은 버킷당 1회, 알파는 globalAlpha 로 입자마다 조절)
 */

/**
 * 중심(0) → 외곽(1) 색온도 램프.
 * tokens.css 의 --light-warm / --light-silver / --light-moon 과 같은 계열이다.
 */
export const TINT_RAMP: readonly string[] = [
  '#f2e9d8', // 온백 — 중심 팽대부
  '#eeeae2',
  '#eaebec',
  '#e4e9ef', // 은백 — 중간 원반
  '#dae3ee',
  '#cdd8e6', // 달빛 — 외곽 팔
  '#bcc9dc', // 헤일로 가장자리
];

export const TINT_BUCKETS = TINT_RAMP.length;

/**
 * 정규 반경(0..1) → 색 버킷 인덱스.
 *
 * @param radialT 중심으로부터의 거리 0..1
 * @param jitter  -1..1 — 같은 반경이라도 색이 조금씩 다르게 흩어지도록
 */
export function tintBucket(radialT: number, jitter = 0): number {
  const t = radialT + jitter * 0.09;
  const index = Math.round(t * (TINT_BUCKETS - 1));
  return index < 0 ? 0 : index > TINT_BUCKETS - 1 ? TINT_BUCKETS - 1 : index;
}

/** 색이 없는 은하(중심)의 대표색. 오라와 표식이 함께 쓴다. */
export const NEUTRAL_TINT = '#e4e9ef';

/** #rrggbb → [r, g, b] */
export function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 제자 은하의 색 램프를 만든다.
 *
 * 중심(0)은 거의 흰색이고 바깥으로 갈수록 그 제자의 색이 진해진다.
 * 실제 성운이 그렇듯 중심부는 밝아서 색이 날아가고 외곽에서 색이 드러난다.
 *
 * ★ 원색을 쓰지 않는다
 *   기준색 자체를 낮은 채도로 골라 두었고, 여기서도 흰색과 섞어
 *   더 눅인다. 프로젝트의 흑백 절제 기조를 깨지 않으면서 12개를
 *   구분할 수 있을 만큼만 색을 준다.
 *
 * @param base 기준색 (#rrggbb). null 이면 기본 은백 램프를 그대로 쓴다.
 */
export function rampFor(base: string | null): readonly string[] {
  if (!base) return TINT_RAMP;

  const [br, bg, bb] = parseHex(base);
  const last = TINT_BUCKETS - 1;

  return TINT_RAMP.map((neutralHex, index) => {
    const [nr, ng, nb] = parseHex(neutralHex);
    /*
     * 중심은 색을 거의 섞지 않고, 외곽으로 갈수록 기준색 비중을 올린다.
     *
     * 상한을 0.74 → 0.92 로 올렸다. 위성 은하는 화면에서 작게 보여
     * 색이 회백으로 수렴하는데, 12개를 눈으로 구분하려면 외곽만큼은
     * 제자의 색이 분명히 드러나야 한다. (기준색 자체가 낮은 채도라
     * 여기서 비중을 올려도 원색이 되지는 않는다)
     */
    const mix = 0.18 + (index / last) * 0.74;
    return toHex(nr + (br - nr) * mix, ng + (bg - ng) * mix, nb + (bb - nb) * mix);
  });
}

/** rgba 문자열을 만들 때 쓰는 헬퍼 (안개처럼 호출 빈도가 낮은 곳 전용). */
export function tintRgba(bucket: number, alpha: number, ramp: readonly string[] = TINT_RAMP): string {
  const hex = ramp[bucket] ?? ramp[0];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
