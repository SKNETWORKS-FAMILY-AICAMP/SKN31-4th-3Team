#!/usr/bin/env python3
"""
scripts/inspect_search.py
────────────────────────────────────────────────────────────────────────
검색 결과를 눈으로 본다.

    python scripts/inspect_search.py --models oll8b large
    python scripts/inspect_search.py --models oll8b --query "요즘 너무 불안해서 잠이 안 와요"
    python scripts/inspect_search.py --models oll8b --set topical --top 10

★ 왜 필요한가
  상담 검색은 어느 모델이든 R@3 이 0.1 을 못 넘었다. 원인이 둘 중
  어느 쪽인지 숫자로는 가릴 수 없다.

    (가) 정답셋이 빡빡하다 — 3만 절 중 5개만 정답으로 찍어 뒀으니,
         모델이 가져온 다른 좋은 구절이 전부 오답 처리됐다.
    (나) 진짜로 못 찾는다 — 현대 구어와 개역개정 문어체 사이에
         겹치는 단어가 거의 없다.

  (가)면 정답셋을 고쳐야 하고, (나)면 검색 방식을 바꿔야 한다.
  처방이 정반대라 반드시 가려야 한다. 그리고 가리는 방법은 하나뿐이다 —
  실제로 뭐가 나오는지 읽어 보는 것.

★ 임베딩은 벤치마크 캐시를 그대로 쓴다
  bench_embeddings.py 를 이미 돌렸다면 다시 계산하지 않는다.
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

try:
    import environ

    environ.Env.read_env(SERVER / ".env")
except ImportError:
    pass

from scripture.chunking import Strategy, chunk, load_verses  # noqa: E402
from scripture.eval.providers import REGISTRY  # noqa: E402
from scripture import tone as tone_module  # noqa: E402

BIBLE = SERVER.parent / "data" / "bible_structured.json"
GOLD = SERVER / "scripture" / "eval" / "gold_ko.json"
CACHE = SERVER / ".embed-cache"

GREEN = "\033[32m"
DIM = "\033[2m"
RESET = "\033[0m"


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5 or 1.0
    nb = sum(x * x for x in b) ** 0.5 or 1.0
    return dot / (na * nb)


def load_cache(model_name: str, strategy: str, tag: str):
    path = CACHE / f"{model_name}__{strategy}__{tag}.pkl"
    if not path.exists():
        return None
    with path.open("rb") as fp:
        return pickle.load(fp)


def audit(embedder, items, queries, keys, vectors, covers, text_of, top: int) -> None:
    """
    게이트를 끈 상태로 상위 N개를 뽑아, 무엇이 걸렸을지 센다.

    ★ 왜 이걸 따로 재는가
      게이트를 켜 놓고 결과만 보면 "아무 일도 안 일어났다" 와 "걸러야 할
      것이 애초에 없었다" 를 구분할 수 없다. 걸러진 것을 직접 세야
      이 층이 값을 하는지 알 수 있다.
    """
    blocked: list[tuple[str, str, int]] = []
    demoted: list[tuple[str, str, int]] = []

    for item, qv in zip(items, queries):
        scored = sorted(
            ((cosine(qv, row), key) for key, row in zip(keys, vectors)), reverse=True
        )[:200]

        rank = 0
        seen: set[str] = set()
        for _, ckey in scored:
            if rank >= top:
                break
            for vk in covers[ckey]:
                if vk in seen or rank >= top:
                    continue
                seen.add(vk)
                rank += 1
                t = tone_module.tone_of_key(vk)
                if t is tone_module.Tone.WARNING:
                    blocked.append((item["q"], vk, rank))
                elif t is tone_module.Tone.LAMENT:
                    demoted.append((item["q"], vk, rank))

    print(f"\n질의 {len(items)}개 × 상위 {top}개 = {len(items) * top}칸을 훑었습니다.\n")

    for label, rows in (("차단 (저주·심판)", blocked), ("강등 (탄식)", demoted)):
        print(f"  {label}: {len(rows)}건")
        for q, vk, rank in rows[:12]:
            body = text_of.get(vk, "")[:40]
            print(f'{DIM}      {rank:2}위  {vk:12} {body}')
            print(f'            ← "{q[:34]}"{RESET}')
        if len(rows) > 12:
            print(f"{DIM}      … 외 {len(rows) - 12}건{RESET}")
        print()

    if not blocked and not demoted:
        print(f"{DIM}  아무것도 안 걸렸습니다. 이 정답셋 범위에서는 게이트가")
        print(f"  하는 일이 없다는 뜻입니다 — 그래도 안전망으로 둘지,")
        print(f"  복잡도를 줄이려고 뺄지는 판단의 문제입니다.{RESET}")


def main() -> int:
    ap = argparse.ArgumentParser(description="검색 결과를 눈으로 확인")
    ap.add_argument("--models", nargs="+", default=["oll8b"], choices=sorted(REGISTRY))
    ap.add_argument("--strategy", default="verse", choices=[s.value for s in Strategy])
    ap.add_argument("--set", dest="section", default="topical", choices=["topical", "paraphrase"])
    ap.add_argument("--query", help="정답셋 대신 직접 물어본다")
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--limit", type=int, default=5, help="정답셋에서 몇 개 질의를 볼 것인가")
    ap.add_argument("--no-tone", action="store_true", help="구절 성격 조정을 끈다")
    ap.add_argument(
        "--audit",
        action="store_true",
        help="게이트가 실제로 무엇을 걸렀는지 전체 질의로 집계한다",
    )
    args = ap.parse_args()

    verses = load_verses(BIBLE)
    chunks = chunk(verses, Strategy(args.strategy))
    text_of = {f"{v.book}.{v.chapter}.{v.verse}": v.content for v in verses}

    gold = json.loads(GOLD.read_text(encoding="utf-8"))
    if args.query:
        items = [{"q": args.query, "relevant": []}]
    elif args.audit:
        # 감사에는 전체 질의를 쓴다 — 표본이 적으면 "한 번도 안 걸렸다" 가
        # 게이트가 필요 없다는 뜻인지 표본이 작다는 뜻인지 알 수 없다.
        items = gold["topical"] + gold["paraphrase"]
    else:
        items = gold[args.section][: args.limit]

    for name in args.models:
        embedder = REGISTRY[name]()
        if not type(embedder).available():
            print(f"⊘ {name} 건너뜀 — 키 또는 서버가 없습니다")
            continue

        cached = load_cache(embedder.spec.name, args.strategy, "s8000")
        if cached is None:
            print(f"⊘ {name} 건너뜀 — 캐시가 없습니다.")
            print(f"   먼저: python scripts/bench_embeddings.py --models {name} "
                  f"--strategies {args.strategy}")
            continue

        keys, vectors = cached["keys"], cached["vectors"]
        covers = {c.key: c.verse_keys for c in chunks}

        print(f"\n{'═' * 72}")
        print(f"  {embedder.spec.name}   ({args.strategy}, {len(keys):,}개 중에서)")
        print("═" * 72)

        queries = embedder.embed([it["q"] for it in items], is_query=True)

        if args.audit:
            audit(embedder, items, queries, keys, vectors, covers, text_of, args.top)
            continue

        for item, qv in zip(items, queries):
            relevant = set(item["relevant"])
            scored = sorted(
                ((cosine(qv, row), key) for key, row in zip(keys, vectors)),
                reverse=True,
            )[:200]

            print(f'\n"{item["q"]}"')
            if relevant:
                refs = " ".join(sorted(relevant))
                print(f"{DIM}  정답으로 찍어 둔 것: {refs}{RESET}")
            print()

            if not args.no_tone:
                scored = tone_module.rerank(scored)

            # ★ 순서 있는 목록으로 모은다.
            #   set 은 삽입 순서를 지키지 않는다. 여기서 set 을 잘라
            #   "상위 N개" 를 세면 엉뚱한 N개를 세게 되고, 그 숫자는
            #   그럴듯해 보여서 아무도 의심하지 않는다.
            shown: list[tuple[float, str]] = []
            seen: set[str] = set()
            for score, ckey in scored:
                if len(shown) >= args.top:
                    break
                for vk in covers[ckey]:
                    if vk in seen or len(shown) >= args.top:
                        continue
                    seen.add(vk)
                    shown.append((score, vk))

            for rank, (score, vk) in enumerate(shown, start=1):
                hit = GREEN + "✓" + RESET if vk in relevant else " "
                lament = tone_module.tone_of_key(vk) is tone_module.Tone.LAMENT
                mark = DIM + "▽" + RESET if lament else " "
                body = text_of.get(vk, "")[:50]
                print(f"  {hit}{mark}{rank:2}. [{score:.3f}] {vk:14} {body}")

            if relevant:
                found = sum(1 for _, vk in shown if vk in relevant)
                print(f"{DIM}     → 상위 {len(shown)}개 중 정답 {found}/{len(relevant)}개{RESET}")

    print(f"\n{DIM}✓ 정답셋에 있음   ▽ 탄식으로 분류돼 순위가 내려간 것")
    print(f"  저주·심판 선언은 아예 빠집니다 (scripture/tone.py)")
    print(f"\n  ✓ 가 없는 줄도 읽어 보세요 —")
    print(f"  그중 '이것도 맞는데' 가 많으면 정답셋이 빡빡한 것이고,")
    print(f"  전부 엉뚱하면 검색이 못 찾는 것입니다.{RESET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
