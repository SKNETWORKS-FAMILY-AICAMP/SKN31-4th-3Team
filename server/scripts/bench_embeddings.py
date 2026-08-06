#!/usr/bin/env python3
"""
scripts/bench_embeddings.py
────────────────────────────────────────────────────────────────────────
임베딩 모델 × 청킹 방식 격자 비교.

    # 하네스가 도는지부터 (네트워크·키 없이)
    python scripts/bench_embeddings.py --models hash --strategies verse

    # 실제 비교 (OPENAI_API_KEY 필요)
    python scripts/bench_embeddings.py \
        --models small large --strategies verse window1 window2 sliding

    # 최종 확인 — 전체 31,077절을 검색 공간으로
    python scripts/bench_embeddings.py --models small large --corpus full

★ 왜 기본이 표본 corpus 인가
  전체를 임베딩하면 격자 한 칸마다 31,077개를 부른다. 4모델 × 4방식
  이면 50만 건이고, 모델을 고르기도 전에 돈과 시간을 다 쓴다.
  표본은 "정답 구절 전부 + 무작위 N개" 라서, 정답이 빠지는 일 없이
  난이도만 낮춘다. 순위를 가리는 데는 이걸로 충분하고, 최종 후보
  둘만 --corpus full 로 다시 돌리면 된다.

★ 임베딩은 디스크에 쌓인다
  같은 (모델, 방식, corpus) 조합을 다시 돌리면 API 를 부르지 않는다.
  지표 계산을 고치고 다시 돌릴 때 돈이 또 나가면, 고치는 것을 망설이게
  된다.
"""

from __future__ import annotations

import argparse
import json
import pickle
import random
import sys
import time
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

# ★ server/.env 를 읽어 온다.
#   Django 는 settings.py 에서 이걸 하지만 이 스크립트는 Django 를 띄우지
#   않는다. 안 읽으면 .env 에 키를 넣어 둔 사람이 "키가 없습니다" 를 보고
#   무엇이 잘못됐는지 한참 찾게 된다.
try:
    import environ

    environ.Env.read_env(SERVER / ".env")
except ImportError:
    pass

from scripture.chunking import Strategy, chunk, load_verses, verse_key  # noqa: E402
from scripture.eval import metrics  # noqa: E402
from scripture.eval.providers import REGISTRY, Embedder  # noqa: E402
from scripture import tone as tone_module  # noqa: E402

BIBLE = SERVER.parent / "data" / "bible_structured.json"
GOLD = SERVER / "scripture" / "eval" / "gold_ko.json"
CACHE = SERVER / ".embed-cache"

#: 표본 corpus 크기. 정답 구절은 이와 별개로 전부 포함된다.
SAMPLE_SIZE = 8000
#: 표본을 뽑는 씨앗. 고정해야 실행 사이에 결과를 비교할 수 있다.
SEED = 20260805


def cosine_ranking(query: list[float], matrix: list[list[float]], keys: list[str], k: int):
    """
    코사인 유사도 상위 k. (점수, 키) 로 돌려준다.

    ★ 벡터가 정규화돼 있다고 가정하지 않는다.
      공급자마다 다르고, 한 곳만 안 맞아도 그 모델만 조용히 나빠진다.

    ★ 점수를 버리지 않는다.
      뒤에서 구절 성격(tone)으로 순위를 조정하려면 원 점수가 필요하다.
    """
    qn = sum(v * v for v in query) ** 0.5 or 1.0
    scored = []
    for key, row in zip(keys, matrix):
        dot = sum(a * b for a, b in zip(query, row))
        rn = sum(v * v for v in row) ** 0.5 or 1.0
        scored.append((dot / (qn * rn), key))
    scored.sort(reverse=True)
    return scored[:k]


def build_corpus(strategy: Strategy, needed: set[str], full: bool):
    """
    검색 공간을 만든다.

    :param needed: 정답 구절 참조. 표본에서도 반드시 남는다.
    """
    verses = load_verses(BIBLE)
    chunks = chunk(verses, strategy)

    if full:
        return chunks

    keep, rest = [], []
    for c in chunks:
        # 정답을 덮는 청크는 무조건 남긴다 — 표본에서 빠지면 Recall 이
        # 모델 탓이 아니라 표본 탓으로 떨어진다.
        if needed & set(c.verse_keys):
            keep.append(c)
        else:
            rest.append(c)

    random.Random(SEED).shuffle(rest)
    return keep + rest[: max(SAMPLE_SIZE - len(keep), 0)]


def _heartbeat(total: int, start: float):
    """
    30초마다 경과 시간을 찍는다.

    ★ 로컬 모델은 몇십 분이 걸린다.
      아무 출력이 없으면 "멈춘 건가" 를 의심하다가 결국 Ctrl-C 를 누르게
      된다. 진행률은 알 수 없지만(임베딩은 한 번의 호출이다) 살아 있다는
      것만 보여도 다르다.
    """
    import threading

    stop = threading.Event()

    def tick():
        while not stop.wait(30):
            mins = (time.time() - start) / 60
            print(f"   … {mins:.0f}분 경과 ({total:,}청크 처리 중)", flush=True)

    threading.Thread(target=tick, daemon=True).start()
    return stop


def embed_corpus(embedder: Embedder, strategy: Strategy, chunks, tag: str):
    """임베딩. 같은 조합은 디스크에서 꺼낸다."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{embedder.spec.name}__{strategy.value}__{tag}.pkl"

    if path.exists():
        with path.open("rb") as fp:
            cached = pickle.load(fp)
        if cached["keys"] == [c.key for c in chunks]:
            return cached["vectors"], 0.0

    start = time.time()
    stop = _heartbeat(len(chunks), start)
    try:
        vectors = embedder.embed([c.embed_text for c in chunks], is_query=False)
    finally:
        stop.set()
    elapsed = time.time() - start

    with path.open("wb") as fp:
        pickle.dump({"keys": [c.key for c in chunks], "vectors": vectors}, fp)
    return vectors, elapsed


def run(embedder: Embedder, strategy: Strategy, gold: dict, full: bool, use_tone: bool = True):
    needed = {
        ref
        for section in ("paraphrase", "topical")
        for item in gold[section]
        for ref in item["relevant"]
    }
    chunks = build_corpus(strategy, needed, full)
    tag = "full" if full else f"s{SAMPLE_SIZE}"

    vectors, seconds = embed_corpus(embedder, strategy, chunks, tag)
    keys = [c.key for c in chunks]

    # 청크 키 → 그 청크가 덮는 구절들. SLIDING 은 하나가 여럿을 덮는다.
    covers = {c.key: c.verse_keys for c in chunks}

    out = {}
    for section in ("paraphrase", "topical"):
        items = gold[section]
        queries = embedder.embed([it["q"] for it in items], is_query=True)

        results = []
        for item, qv in zip(items, queries):
            ranked_chunks = cosine_ranking(qv, vectors, keys, k=60)

            # 청크를 구절로 펼치면서 순서를 지키고 중복을 없앤다.
            # SLIDING 은 한 청크가 5절을 데려오므로 이 단계가 필수다.
            scored: list[tuple[float, str]] = []
            seen: set[str] = set()
            for score, ck in ranked_chunks:
                for vk in covers[ck]:
                    if vk not in seen:
                        seen.add(vk)
                        scored.append((score, vk))

            # 저주·심판 선언을 빼고 탄식을 아래로 내린다 (scripture/tone.py)
            if use_tone:
                scored = tone_module.rerank(scored)

            results.append(([vk for _, vk in scored], set(item["relevant"])))

        out[section] = metrics.score(results)

    return out, len(chunks), seconds


def main() -> int:
    ap = argparse.ArgumentParser(description="임베딩 모델 × 청킹 비교")
    ap.add_argument("--models", nargs="+", default=["hash"], choices=sorted(REGISTRY))
    ap.add_argument(
        "--strategies",
        nargs="+",
        default=["verse", "window2"],
        choices=[s.value for s in Strategy],
    )
    ap.add_argument("--corpus", choices=["sample", "full"], default="sample")
    ap.add_argument("--out", type=Path, help="결과를 JSON 으로도 남긴다")
    ap.add_argument("--list", action="store_true", help="쓸 수 있는 모델만 확인하고 끝낸다")
    ap.add_argument(
        "--no-tone",
        action="store_true",
        help="구절 성격 조정을 끈다 (끄고 켠 차이를 보고 싶을 때)",
    )
    args = ap.parse_args()

    if args.list:
        print(f"{'이름':10} {'상태':6} 모델")
        print("─" * 52)
        for key in sorted(REGISTRY):
            embedder = REGISTRY[key]()
            ok = type(embedder).available()
            print(f"{key:10} {'준비됨' if ok else '없음  ':6} {embedder.spec.name}")
        print("\n'없음' 은 API 키 또는 패키지가 없다는 뜻입니다:")
        print("  small·large → OPENAI_API_KEY   voyage → VOYAGE_API_KEY")
        print("  qwen*       → pip install sentence-transformers")
        return 0

    gold = json.loads(GOLD.read_text(encoding="utf-8"))
    full = args.corpus == "full"

    rows = []
    for name in args.models:
        make = REGISTRY[name]
        embedder = make()

        if not type(embedder).available():
            print(f"⊘ {name:10} 건너뜀 — 키 또는 패키지가 없습니다")
            continue

        for value in args.strategies:
            strategy = Strategy(value)
            print(f"… {name} × {value} 임베딩 중", flush=True)
            try:
                scores, n_chunks, seconds = run(
                    embedder, strategy, gold, full, use_tone=not args.no_tone
                )
            except Exception as exc:  # noqa: BLE001
                # 한 조합이 실패해도 나머지 격자는 끝까지 돈다.
                print(f"✗ {name} × {value} 실패: {exc}")
                continue

            rows.append(
                {
                    "model": embedder.spec.name,
                    "dim": embedder.spec.dim,
                    "strategy": value,
                    "chunks": n_chunks,
                    "seconds": round(seconds, 1),
                    "paraphrase": scores["paraphrase"],
                    "topical": scores["topical"],
                }
            )

    if not rows:
        print("\n돌릴 수 있는 조합이 없습니다. 키를 확인해 주세요.")
        return 1

    for section in ("paraphrase", "topical"):
        title = "지시적 검색 (구절 찾기)" if section == "paraphrase" else "상담 검색 (실사용)"
        print(f"\n═══ {title} ═══")
        head = f"{'모델':22} {'청킹':9} " + " ".join(f"{h:>7}" for h in metrics.HEADERS)
        print(head)
        print("─" * len(head))
        for r in sorted(rows, key=lambda r: -r[section].ndcg_at_10):
            cells = " ".join(f"{c:>7}" for c in r[section].row())
            print(f"{r['model']:22} {r['strategy']:9} {cells}")

    gate = "끔" if args.no_tone else "켬"
    print(f"\ncorpus: {args.corpus} · 질의 {rows[0]['paraphrase'].n}+{rows[0]['topical'].n}개 · tone {gate}")
    print("nDCG@10 이 가장 종합적입니다. 다만 화면에 구절 3개를 보여 주므로 R@3 을 함께 보세요.")

    if args.out:
        args.out.write_text(
            json.dumps(
                [{**r, "paraphrase": r["paraphrase"].__dict__, "topical": r["topical"].__dict__} for r in rows],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"→ {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
