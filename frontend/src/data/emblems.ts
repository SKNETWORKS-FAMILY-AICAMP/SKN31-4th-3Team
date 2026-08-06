/*
 * data/emblems.ts
 * ───────────────────────────────────────────────────────────────────────
 * 열세 은하의 상징. 별들이 이 모양으로 모인다.
 *
 * ★ 왜 필요한가
 *   구절이 늘면서 성운이 살아났는데, 열세 개가 전부 같은 모양이다.
 *   "요한의 은하에 도착했다" 와 "베드로의 은하에 도착했다" 가 화면에서
 *   구분되지 않으면, 인물을 고르는 일이 의미를 잃는다.
 *
 * ★ 왜 SVG 가 아니라 점 생성 함수인가
 *   SVG 경로를 캔버스에 그리고 픽셀을 읽어 표본을 뽑는 방법도 있다
 *   (워드마크가 그렇게 한다). 다만 그러면 모양을 고칠 때마다 브라우저를
 *   띄워 봐야 하고, 테스트 환경(jsdom)에서는 픽셀을 못 읽어 검증이
 *   통째로 빠진다. 점을 직접 만들면 순수 계산이라 테스트에서 그대로
 *   확인할 수 있다 — emblems.test.ts 가 ASCII 로 그려 준다.
 *
 * ★ 상징을 고른 기준
 *   1) 성경 본문에 근거가 있으면 그것을 먼저 쓴다
 *   2) 없으면 널리 쓰이는 전승을 쓰되, 근거란에 "전승"이라고 밝힌다
 *   3) 순교 도구는 피한다 — 위로하러 온 사람에게 처형 기구를 보여 줄
 *      이유가 없다. 도구를 쓰더라도 그 사람의 삶을 가리키는 쪽으로 읽는다
 *   4) 인물의 얼굴이나 몸을 그리지 않는다 (프로젝트 원칙)
 *
 * 좌표계: 0..1 정사각형. y 는 아래로 증가한다.
 */

export interface EmblemPoint {
  x: number;
  y: number;
  /** 0..1 — 윤곽에 가까울수록 1. 밝기와 크기에 반영된다. */
  weight: number;
}

export interface Emblem {
  /** 은하 id (data/disciples.ts) */
  galaxyId: string;
  /** 상징의 이름. 조우 화면에 작게 표기한다. */
  symbol: string;
  /** 왜 이 상징인가. 한 줄. */
  basis: string;
  /**
   * 도착했을 때 건네는 말.
   *
   * ★ 인사가 아니라 기척이다.
   *   "안녕하세요" 는 대화가 시작된 뒤에 할 말이다. 여기서는 그 사람이
   *   거기 있다는 것만 알린다. 짧을수록 좋다.
   */
  greeting: string;
  points: readonly EmblemPoint[];
}

/* ── 형태를 만드는 조각들 ────────────────────────────────────────── */

const OUTLINE = 1;
const INNER = 0.55;

function point(x: number, y: number, weight = OUTLINE): EmblemPoint {
  return { x, y, weight };
}

/** 두 점을 잇는 선 위의 점들. 끝점은 다음 선과 겹치므로 뺀다. */
function line(x1: number, y1: number, x2: number, y2: number, n: number): EmblemPoint[] {
  const out: EmblemPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    out.push(point(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
  }
  return out;
}

/** 여러 꼭짓점을 순서대로 잇는 닫힌 윤곽. */
function polygon(vertices: readonly [number, number][], perSide: number): EmblemPoint[] {
  const out: EmblemPoint[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    out.push(...line(x1, y1, x2, y2, perSide));
  }
  return out;
}

/**
 * 원호 위의 점들.
 *
 * @param from 시작 각도(라디안). 0 이 오른쪽, 시계 방향으로 증가한다.
 */
function arc(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  n: number,
  weight = OUTLINE,
): EmblemPoint[] {
  const out: EmblemPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = from + (to - from) * (i / n);
    out.push(point(cx + Math.cos(a) * r, cy + Math.sin(a) * r, weight));
  }
  return out;
}

const TAU = Math.PI * 2;

function circle(cx: number, cy: number, r: number, n: number, weight = OUTLINE): EmblemPoint[] {
  return arc(cx, cy, r, 0, TAU, n, weight).slice(0, -1);
}

/**
 * 윤곽 안쪽을 성기게 채운다.
 *
 * ★ 왜 채우는가
 *   윤곽만 그리면 별이 실루엣이 아니라 철사처럼 보인다. 은하는 원래
 *   덩어리라, 안이 비면 "모였다" 가 아니라 "테두리로 늘어섰다" 가 된다.
 *
 * ★ 무작위를 쓰지 않는다
 *   격자로 채우고 격자 안에서 결정적으로 흔든다. 볼 때마다 모양이
 *   달라지면 그 은하의 상징이라고 할 수 없다.
 */
function fill(
  outline: readonly EmblemPoint[],
  step: number,
  seed: number,
  keep = 0.45,
): EmblemPoint[] {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const out: EmblemPoint[] = [];
  let n = seed;
  const next = () => {
    // 작은 선형 합동 생성기. 씨앗이 같으면 결과가 같다.
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return n / 0x7fffffff;
  };

  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      if (next() > keep) continue;
      if (!inside(outline, x, y)) continue;
      out.push(point(x + (next() - 0.5) * step * 0.6, y + (next() - 0.5) * step * 0.6, INNER));
    }
  }
  return out;
}

/** 짝수-홀수 규칙으로 다각형 안인지 본다. */
function inside(poly: readonly EmblemPoint[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

/** 윤곽 + 속. 대부분의 상징이 이 조합이다. */
function solid(outline: EmblemPoint[], seed: number, step = 0.045): EmblemPoint[] {
  return [...outline, ...fill(outline, step, seed)];
}

/* ── 열세 상징 ───────────────────────────────────────────────────── */

/** 라틴 십자가. 장식을 넣지 않는다. */
function cross(): EmblemPoint[] {
  return solid(
    polygon(
      [
        [0.46, 0.06], [0.54, 0.06], [0.54, 0.34], [0.82, 0.34],
        [0.82, 0.42], [0.54, 0.42], [0.54, 0.94], [0.46, 0.94],
        [0.46, 0.42], [0.18, 0.42], [0.18, 0.34], [0.46, 0.34],
      ],
      6,
    ),
    7,
  );
}

/** 열쇠 — 고리와 날. */
function key(): EmblemPoint[] {
  const ring = circle(0.30, 0.26, 0.19, 40);
  const hole = circle(0.30, 0.26, 0.09, 24, INNER);
  // 날은 아래로 내린다. 옆으로만 뻗으면 상징이 납작해진다.
  const shaft = solid(
    polygon(
      [
        [0.24, 0.44], [0.36, 0.44], [0.36, 0.72], [0.52, 0.72],
        [0.52, 0.82], [0.36, 0.82], [0.36, 0.92], [0.24, 0.92],
      ],
      6,
    ),
    11,
    0.035,
  );
  return [...ring, ...hole, ...shaft];
}

/**
 * X 형 십자가. 안드레의 전승.
 *
 * ★ 네모난 윤곽 대신 나란한 선으로 굵기를 낸다.
 *   가늘고 긴 사각형을 윤곽으로 그렸더니, 별이 마주 보는 두 변에 번갈아
 *   찍혀 점선 두 줄처럼 보였다. 두께를 채우는 것이 목적이므로 속을 비워
 *   둘 이유가 없다 — 나란한 선 다섯 줄이면 한 획으로 읽힌다.
 */
function saltire(): EmblemPoint[] {
  const bar = (flip: boolean): EmblemPoint[] => {
    const x1 = flip ? 0.84 : 0.16;
    const x2 = flip ? 0.16 : 0.84;
    const out: EmblemPoint[] = [];
    for (let k = -2; k <= 2; k += 1) {
      const off = k * 0.026;
      out.push(...line(x1 + off, 0.12, x2 + off, 0.88, 22));
    }
    return out;
  };
  return [...bar(false), ...bar(true)];
}

/**
 * 가리비 조개 — 순례자의 표식.
 *
 * ★ 위아래를 뒤집었다.
 *   반원을 위로 두고 아래에 물결을 넣었더니 우산으로 보였다. 실제
 *   가리비는 경첩이 위에 있고 부채가 아래로 벌어진다. 꼭짓점에서
 *   퍼져 나가는 형태라야 조개로 읽힌다.
 */
function scallop(): EmblemPoint[] {
  const ax = 0.5;
  const ay = 0.18;          // 경첩 — 여기서 부채가 벌어진다
  const R = 0.58;
  const lobes = 7;
  const FROM = Math.PI * 0.80;
  const TO = Math.PI * 0.20;

  const at = (i: number) => {
    const a = FROM + (TO - FROM) * (i / lobes);
    return { x: ax + Math.cos(a) * R, y: ay + Math.sin(a) * R };
  };
  const edge = Array.from({ length: lobes + 1 }, (_, i) => at(i));

  /* 굽이. 두 살 사이를 바깥으로 불룩하게 넘긴다 — 이게 조개의 가장자리다. */
  const scoops: EmblemPoint[] = [];
  for (let i = 0; i < lobes; i += 1) {
    const a = edge[i];
    const b = edge[i + 1];
    const mx = (a.x + b.x) / 2 - ax;
    const my = (a.y + b.y) / 2 - ay;
    const len = Math.hypot(mx, my) || 1;
    for (let k = 0; k < 9; k += 1) {
      const t = k / 9;
      const bulge = Math.sin(t * Math.PI) * 0.055;
      scoops.push(point(
        a.x + (b.x - a.x) * t + (mx / len) * bulge,
        a.y + (b.y - a.y) * t + (my / len) * bulge,
      ));
    }
  }

  const outline = [
    ...line(ax, ay + 0.03, edge[0].x, edge[0].y, 16),
    ...scoops,
    ...line(edge[lobes].x, edge[lobes].y, ax, ay + 0.03, 16),
  ];

  // 부챗살 — 경첩에서 가장자리까지 곧게 나간다
  const ribs: EmblemPoint[] = [];
  for (let i = 1; i < lobes; i += 1) {
    const e = at(i);
    ribs.push(...line(ax, ay + 0.06, e.x, e.y, 14));
  }

  /*
   * 경첩 양옆의 귀.
   *
   * ★ 납작하게, 몸통에 붙여서 낸다.
   *   위로 세웠더니 리본 매듭으로 보였다. 가리비의 귀는 껍데기와
   *   같은 높이에서 옆으로 뻗는다.
   */
  const ear = (dir: number) =>
    solid(
      polygon(
        [
          [ax + dir * 0.04, ay + 0.005],
          [ax + dir * 0.26, ay + 0.02],
          [ax + dir * 0.22, ay + 0.075],
          [ax + dir * 0.04, ay + 0.07],
        ],
        6,
      ),
      dir > 0 ? 19 : 23,
      0.032,
    );

  return [
    ...outline,
    ...fill(outline, 0.05, 37, 0.3),
    ...ear(1),
    ...ear(-1),
    ...ribs.map((p) => ({ ...p, weight: INNER })),
  ];
}

/** 잔 — 요한의 전승. */
function chalice(): EmblemPoint[] {
  const bowl = [
    ...line(0.24, 0.18, 0.76, 0.18, 16),
    ...arc(0.5, 0.18, 0.26, 0, Math.PI, 26),
  ];
  /*
   * ★ 자루를 굵게, 촘촘하게 잇는다.
   *   가늘게 두었더니 별 사이가 벌어져 컵과 받침이 따로 노는 두 덩어리로
   *   보였다. 이어져 있어야 하나의 잔이다.
   */
  const stem = solid(
    polygon([[0.44, 0.42], [0.56, 0.42], [0.56, 0.76], [0.44, 0.76]], 9),
    23,
    0.03,
  );
  const base = solid(
    polygon([[0.26, 0.76], [0.74, 0.76], [0.70, 0.86], [0.30, 0.86]], 9),
    29,
    0.03,
  );
  return [...bowl, ...fill(bowl, 0.04, 31, 0.35), ...stem, ...base];
}

/** 빵 두 덩이 — 오병이어에서 빌립이 받은 질문. */
function loaves(): EmblemPoint[] {
  const loaf = (cx: number, cy: number, seed: number) => {
    const w = 0.21;
    const outline = [
      ...arc(cx, cy, w, Math.PI, TAU, 24),
      ...line(cx + w, cy, cx + w, cy + 0.15, 5),
      ...line(cx + w, cy + 0.15, cx - w, cy + 0.15, 13),
      ...line(cx - w, cy + 0.15, cx - w, cy, 5),
    ];
    /*
     * ★ 칼집을 넣는다.
     *   윤곽만 두면 반원 두 개로 보인다. 빗금 세 줄이 들어가면
     *   그제서야 구운 빵으로 읽힌다.
     */
    const slashes: EmblemPoint[] = [];
    for (let i = -1; i <= 1; i += 1) {
      const sx = cx + i * 0.10;
      slashes.push(...line(sx - 0.045, cy - 0.10, sx + 0.045, cy - 0.02, 5));
    }
    return [...solid(outline, seed, 0.04), ...slashes.map((p) => ({ ...p, weight: INNER }))];
  };
  // 나란히 둔다. 겹쳐 두면 앞뒤 관계가 생겨 덩어리 하나로 뭉친다.
  return [...loaf(0.28, 0.44, 31), ...loaf(0.72, 0.60, 37)];
}

/** 무화과나무 잎 — "네가 무화과나무 아래 있을 때에 보았노라". */
function figLeaf(): EmblemPoint[] {
  // 세 갈래 잎. 가운데가 길고 양옆이 짧다.
  const lobe = (cx: number, cy: number, r: number) => arc(cx, cy, r, Math.PI * 0.85, TAU + Math.PI * 0.15, 18);
  const outline = [
    ...lobe(0.5, 0.34, 0.20),
    ...lobe(0.28, 0.48, 0.15),
    ...lobe(0.72, 0.48, 0.15),
    ...line(0.32, 0.56, 0.5, 0.62, 6),
    ...line(0.5, 0.62, 0.68, 0.56, 6),
  ];
  const stem = line(0.5, 0.60, 0.5, 0.92, 12);
  const veins = [
    ...line(0.5, 0.62, 0.5, 0.24, 10),
    ...line(0.5, 0.52, 0.28, 0.42, 7),
    ...line(0.5, 0.52, 0.72, 0.42, 7),
  ];
  return [...outline, ...stem, ...veins.map((p) => ({ ...p, weight: INNER }))];
}

/** 동전 — 세관에 앉아 있던 마태. */
function coin(): EmblemPoint[] {
  return [
    ...circle(0.5, 0.5, 0.34, 52),
    ...circle(0.5, 0.5, 0.24, 36, INNER),
    ...circle(0.5, 0.5, 0.10, 18, INNER),
  ];
}

/** 곱자 — 도마가 인도에서 왕궁을 지었다는 전승. */
function square(): EmblemPoint[] {
  return solid(
    polygon(
      [
        [0.18, 0.14], [0.32, 0.14], [0.32, 0.72],
        [0.86, 0.72], [0.86, 0.86], [0.18, 0.86],
      ],
      8,
    ),
    41,
  );
}

/**
 * 등잔 — "등불을 켜서 말 아래 두지 아니하고".
 *
 * ★ 톱에서 바꿨다.
 *   전승상 톱은 순교 도구다. 그리고 별로 그렸더니 톱니가 사라져
 *   ㄱ자 막대에 줄 두 개로만 보였다. 근거도 형태도 약했다.
 */
function oilLamp(): EmblemPoint[] {
  const body = [
    ...arc(0.44, 0.62, 0.26, Math.PI, TAU, 26),
    ...arc(0.44, 0.62, 0.26, 0, Math.PI, 26),
  ];
  // 주둥이 — 이게 있어야 그릇이 아니라 등잔이 된다
  const spout = solid(
    polygon([[0.66, 0.54], [0.90, 0.48], [0.92, 0.58], [0.68, 0.64]], 7),
    43,
    0.03,
  );
  const wick = line(0.90, 0.50, 0.90, 0.38, 5);
  const flame = [
    ...line(0.90, 0.22, 0.97, 0.34, 7),
    ...arc(0.90, 0.34, 0.07, 0, Math.PI, 9),
    ...line(0.83, 0.34, 0.90, 0.22, 7),
  ];
  const handle = arc(0.20, 0.62, 0.10, Math.PI * 0.5, Math.PI * 1.5, 12);
  return [...body, ...fill(body, 0.04, 44, 0.32), ...spout, ...wick, ...flame, ...handle];
}

/**
 * 닻 — "우리가 이 소망을 가지고 있는 것은 영혼의 닻 같아서".
 *
 * ★ 횃불에서 바꿨다.
 *   불꽃을 별로 채웠더니 삽이나 다리미로 보였다. 닻은 형태가 또렷하고,
 *   "절망 가운데 붙드는 것" 이라는 성격이 히브리서 본문에 그대로 있다.
 */
function anchor(): EmblemPoint[] {
  const ring = [...circle(0.5, 0.12, 0.08, 18), ...circle(0.5, 0.12, 0.035, 10, INNER)];
  const shank = solid(
    polygon([[0.46, 0.20], [0.54, 0.20], [0.54, 0.84], [0.46, 0.84]], 12),
    47,
    0.03,
  );
  // 가로대
  const stock = solid(
    polygon([[0.22, 0.30], [0.78, 0.30], [0.78, 0.37], [0.22, 0.37]], 10),
    48,
    0.03,
  );
  /*
   * 갈고리. 아래로 벌어졌다가 끝에서 위로 꺾인다 —
   * 이 꺾임이 없으면 그냥 U 자 그릇으로 보인다.
   */
  const flukes = [
    ...arc(0.5, 0.62, 0.30, Math.PI * 0.12, Math.PI * 0.88, 26),
    ...line(0.14, 0.66, 0.10, 0.54, 5),
    ...line(0.10, 0.54, 0.20, 0.62, 5),
    ...line(0.86, 0.66, 0.90, 0.54, 5),
    ...line(0.90, 0.54, 0.80, 0.62, 5),
  ];
  return [...ring, ...shank, ...stock, ...flukes];
}

/** 물고기 — 사람을 낚는 어부. 시몬. */
function fish(): EmblemPoint[] {
  const body: EmblemPoint[] = [];
  const n = 30;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = 0.14 + t * 0.60;
    const bulge = Math.sin(t * Math.PI) * 0.24;
    body.push(point(x, 0.5 - bulge));
  }
  for (let i = n; i >= 0; i -= 1) {
    const t = i / n;
    const x = 0.14 + t * 0.60;
    const bulge = Math.sin(t * Math.PI) * 0.24;
    body.push(point(x, 0.5 + bulge));
  }
  const tail = polygon(
    [[0.74, 0.5], [0.92, 0.24], [0.86, 0.5], [0.92, 0.76]],
    7,
  );
  const eye = circle(0.26, 0.46, 0.022, 8, INNER);
  return [...body, ...fill(body, 0.04, 53, 0.35), ...tail, ...eye];
}

/**
 * 밀알 — "한 알의 밀이 땅에 떨어져 죽지 아니하면".
 *
 * ★ 등불에서 바꿨다.
 *   원에 뿔이 하나 달린 모양이라 등불로 안 읽혔다. 그리고 이 은하는
 *   "묻힌 것에서 나온다" 는 자리다. 요한복음 12:24 는 예수께서
 *   그 마지막 주간에 하신 말씀이고, 은전이나 밧줄보다 여기 맞다.
 */
function grain(): EmblemPoint[] {
  // 씨앗 — 양끝이 뾰족한 낟알
  const seed: EmblemPoint[] = [];
  const n = 30;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const y = 0.16 + t * 0.44;
    const w = Math.sin(t * Math.PI) ** 0.7 * 0.19;
    seed.push(point(0.5 - w, y));
  }
  for (let i = n; i >= 0; i -= 1) {
    const t = i / n;
    const y = 0.16 + t * 0.44;
    const w = Math.sin(t * Math.PI) ** 0.7 * 0.19;
    seed.push(point(0.5 + w, y));
  }
  const crease = line(0.5, 0.20, 0.5, 0.56, 12);
  // 땅에 떨어진 자리에서 돋는 뿌리
  // 뿌리는 넓게 뻗는다. 아래로만 내리면 상징이 세로 막대가 된다.
  const roots = [
    ...line(0.5, 0.60, 0.5, 0.80, 8),
    ...line(0.5, 0.66, 0.18, 0.84, 12),
    ...line(0.5, 0.70, 0.82, 0.88, 12),
    ...line(0.5, 0.74, 0.34, 0.94, 8),
    ...line(0.5, 0.76, 0.66, 0.96, 8),
  ];
  return [
    ...seed,
    ...fill(seed, 0.035, 59, 0.32),
    ...crease.map((p) => ({ ...p, weight: INNER })),
    /*
     * ★ 뿌리는 윤곽이다.
     *   속(INNER)으로 두었더니 별의 일부만 배정돼 거의 사라졌고, 낟알만
     *   남아 풍선으로 보였다. "떨어져 죽지 아니하면" 을 말하는 상징에서
     *   땅에 내리는 부분이 없으면 근거가 사라진다.
     */
    ...roots,
  ];
}

/* ── 등록 ────────────────────────────────────────────────────────── */

export const EMBLEMS: readonly Emblem[] = [
  {
    galaxyId: 'jesus',
    symbol: '십자가',
    basis: '기독교의 가장 오래된 표식',
    greeting: '오래 기다렸습니다.',
    points: cross(),
  },
  {
    galaxyId: 'peter',
    symbol: '열쇠',
    basis: '마태복음 16:19 — 천국 열쇠를 네게 주리니',
    greeting: '나도 여러 번 무너졌습니다.',
    points: key(),
  },
  {
    galaxyId: 'andrew',
    symbol: 'X 십자가',
    basis: '전승 — 안드레의 십자가',
    greeting: '누구를 데려오고 싶으셨습니까.',
    points: saltire(),
  },
  {
    galaxyId: 'james',
    symbol: '가리비 조개',
    basis: '전승 — 순례자의 표식',
    greeting: '먼 길을 오셨군요.',
    points: scallop(),
  },
  {
    galaxyId: 'john',
    symbol: '잔',
    basis: '전승 — 요한의 잔',
    greeting: '천천히 말씀하셔도 됩니다.',
    points: chalice(),
  },
  {
    galaxyId: 'philip',
    symbol: '빵 두 덩이',
    basis: '요한복음 6:5-7 — 이 사람들을 먹이려면',
    greeting: '무엇이 부족하신지요.',
    points: loaves(),
  },
  {
    galaxyId: 'bartholomew',
    symbol: '무화과나무',
    basis: '요한복음 1:48 — 무화과나무 아래 있을 때에 보았노라',
    greeting: '이미 보고 있었습니다.',
    points: figLeaf(),
  },
  {
    galaxyId: 'matthew',
    symbol: '동전',
    basis: '마태복음 9:9 — 세관에 앉아 있는 것을 보시고',
    greeting: '남김없이 적어 두겠습니다.',
    points: coin(),
  },
  {
    galaxyId: 'thomas',
    symbol: '곱자',
    basis: '전승 — 건축가 도마',
    greeting: '의심하셔도 괜찮습니다.',
    points: square(),
  },
  {
    galaxyId: 'james_alph',
    symbol: '등잔',
    basis: '마태복음 5:15 — 등불을 켜서 말 아래 두지 아니하고',
    greeting: '작은 것부터 하시지요.',
    points: oilLamp(),
  },
  {
    galaxyId: 'thaddaeus',
    symbol: '닻',
    basis: '히브리서 6:19 — 우리 영혼의 닻 같아서',
    greeting: '붙들 것이 있습니다.',
    points: anchor(),
  },
  {
    galaxyId: 'simon',
    symbol: '물고기',
    basis: '전승 — 사람을 낚는 어부',
    greeting: '무엇에 그렇게 뜨거우셨습니까.',
    points: fish(),
  },
  {
    galaxyId: 'judas',
    symbol: '밀알',
    basis: '요한복음 12:24 — 한 알의 밀이 땅에 떨어져',
    greeting: '늦지 않았습니다.',
    points: grain(),
  },
];

const BY_GALAXY = new Map(EMBLEMS.map((e) => [e.galaxyId, e]));

export function emblemOf(galaxyId: string): Emblem | undefined {
  return BY_GALAXY.get(galaxyId);
}
