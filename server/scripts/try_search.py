"""
실제 앱이 쓰는 검색 경로를 그대로 불러 본다.

    python scripts/try_search.py "요즘 너무 불안해서 잠이 안 와요"
    python scripts/try_search.py --file queries.txt      # 여러 줄을 한 번에
    python scripts/try_search.py "..." --no-tone         # 성격 게이트를 끄고 비교

★ inspect_search.py 와 무엇이 다른가
  그쪽은 벤치마크용 캐시(8,000절 표본 pickle)를 읽는다. 모델을 고르고
  청킹을 바꿔 가며 비교하는 도구다.

  이 스크립트는 DB 의 31,077절과 scripture.search.search() 를 그대로
  쓴다. 즉 화면에서 질문했을 때 나오는 것과 같은 결과다. 둘이 다를 수
  있고, 실제로 다르면 그 차이 자체가 알아야 할 정보다.

★ 왜 필요한가
  "임베딩을 넣었는데 추천이 좋아졌나" 를 확인하려면 앱을 띄우고 질문을
  타이핑해야 했다. 그러면 한 번에 하나씩만 볼 수 있고, 왜 그 구절이
  올라왔는지(성격·주제 가중치)는 보이지 않는다.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from scripture import search as search_mod  # noqa: E402
from scripture.models import EmbeddingRun  # noqa: E402


def show(question: str, *, top: int, use_tone: bool) -> None:
    hits = search_mod.search(question, k=top, use_tone=use_tone)

    print(f"\n■ {question}")
    if not hits:
        print("  (결과 없음 — 폴백으로 넘어갑니다)")
        return

    for i, hit in enumerate(hits, 1):
        marks = f"  [{' · '.join(hit.signals)}]" if hit.signals else ""
        print(f"  {i}. {hit.score:.3f}  {hit.ref}{marks}")
        # 본문은 한 줄로 자른다 — 목록을 훑는 것이 목적이다
        text = hit.content if len(hit.content) <= 70 else hit.content[:70] + "…"
        print(f"      {text}")


def main() -> int:
    ap = argparse.ArgumentParser(description="실제 검색 경로를 불러 본다")
    ap.add_argument("questions", nargs="*", help="물어볼 문장")
    ap.add_argument("--file", type=Path, help="한 줄에 하나씩 적힌 질문 파일")
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--no-tone", action="store_true", help="성격 게이트를 끈다")
    args = ap.parse_args()

    # ★ 준비 상태를 먼저 알린다.
    #   검색이 안 되면 결과가 그냥 비어 나온다. 그때 "임베딩이 안 좋구나"
    #   로 오해하기 쉬운데, 실제로는 모델이 안 떠 있거나 적재 기록이
    #   없는 경우가 대부분이다.
    #
    # ★ ready() 를 먼저 부른다.
    #   표가 아직 없는 DB 에서 EmbeddingRun 을 먼저 조회하면 OperationalError
    #   가 그대로 터진다. "아직 migrate 를 안 했다" 를 스택트레이스로
    #   알려 줄 이유가 없다.
    try:
        available = search_mod.ready()
    except Exception:  # 표가 없거나 DB 가 안 뜬 경우
        available = False

    if not available:
        print("검색을 쓸 수 없습니다.")
        print("  - Postgres 인가?          (DATABASE_URL 확인)")
        print("  - migrate 를 돌렸는가?")
        print("  - 임베딩을 적재했는가?    (ingest_bible --embed)")
        return 1

    run = EmbeddingRun.objects.first()
    print(f"모델: {run.model_name} · {run.dim}차원 · {run.verses:,}절")
    print(f"성격 게이트: {'끔' if args.no_tone else '켬'}")

    questions = list(args.questions)
    if args.file:
        questions += [
            line.strip() for line in args.file.read_text(encoding="utf-8").splitlines() if line.strip()
        ]

    if not questions:
        # 상담에서 실제로 들어올 법한 문장들. 기본값으로 한 바퀴 돌려 본다.
        questions = [
            "요즘 너무 불안해서 잠이 안 와요",
            "사람들 속에 있어도 외로워요",
            "제 잘못이 후회돼요",
            "그 사람을 용서하기가 어려워요",
            "번아웃이 와서 아무것도 못 하겠어요",
            "오늘은 정말 감사한 하루였어요",
        ]

    for question in questions:
        show(question, top=args.top, use_tone=not args.no_tone)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
