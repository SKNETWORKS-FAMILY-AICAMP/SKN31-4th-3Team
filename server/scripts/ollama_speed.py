#!/usr/bin/env python3
"""
scripts/ollama_speed.py
────────────────────────────────────────────────────────────────────────
Ollama 임베딩 속도를 재고 남은 시간을 추정한다.

    python scripts/ollama_speed.py                       # 기본 모델·기본 청킹
    python scripts/ollama_speed.py --model qwen3-embedding:0.6b
    python scripts/ollama_speed.py --strategy window2

★ 왜 필요한가
  임베딩은 한 번의 함수 호출이라 진행률이 없다. 30분이 지나도 "절반쯤
  왔나, 10%인가" 를 알 수 없고, 그러면 기다릴지 포기할지 정할 수가 없다.
  실제 본문 몇 개로 재 보면 남은 시간을 숫자로 말할 수 있다.

★ 벤치마크가 도는 중이면 결과가 느리게 나온다
  같은 GPU 를 나눠 쓰기 때문이다. 그래도 "대충 몇 시간인가" 를 가르는
  데는 충분하다. 정확히 재려면 벤치마크를 멈추고 돌리면 된다.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

from scripture.chunking import Strategy, chunk, load_verses  # noqa: E402

BIBLE = SERVER.parent / "data" / "bible_structured.json"
HOST = "http://localhost:11434"

#: 벤치마크가 쓰는 표본 크기 (bench_embeddings.SAMPLE_SIZE 와 같아야 한다)
SAMPLE_SIZE = 8000


def embed(model: str, texts: list[str]) -> float:
    """한 묶음을 보내고 걸린 시간을 돌려준다."""
    payload = json.dumps({"model": model, "input": texts}).encode()
    request = urllib.request.Request(
        f"{HOST}/api/embed", data=payload, headers={"Content-Type": "application/json"}
    )
    start = time.time()
    with urllib.request.urlopen(request, timeout=900) as response:
        body = json.loads(response.read())
    elapsed = time.time() - start

    got = len(body.get("embeddings", []))
    if got != len(texts):
        raise RuntimeError(f"{len(texts)}개를 보냈는데 {got}개가 왔습니다")
    return elapsed


def human(seconds: float) -> str:
    if seconds < 90:
        return f"{seconds:.0f}초"
    if seconds < 5400:
        return f"{seconds / 60:.0f}분"
    return f"{seconds / 3600:.1f}시간"


def main() -> int:
    ap = argparse.ArgumentParser(description="Ollama 임베딩 속도 측정")
    ap.add_argument("--model", default="qwen3-embedding:8b")
    ap.add_argument("--strategy", default="verse", choices=[s.value for s in Strategy])
    ap.add_argument("--sample", type=int, default=64, help="몇 개로 잴 것인가")
    args = ap.parse_args()

    # ★ 진짜 본문으로 잰다.
    #   "안녕하세요" 를 64번 보내면 실제보다 훨씬 빠르게 나온다. 길이가
    #   다르고, 같은 문장이 반복되면 캐시가 걸릴 수도 있다.
    chunks = chunk(load_verses(BIBLE), Strategy(args.strategy))
    texts = [c.embed_text for c in chunks[: args.sample]]
    avg_len = sum(len(t) for t in texts) / len(texts)

    print(f"모델   {args.model}")
    print(f"청킹   {args.strategy} (평균 {avg_len:.0f}자)")
    print(f"표본   {len(texts)}개\n")

    try:
        # 첫 호출은 모델을 메모리에 올리느라 느리다. 버린다.
        print("… 모델 올리는 중 (첫 호출은 버립니다)", flush=True)
        embed(args.model, texts[:8])

        print("… 측정 중", flush=True)
        elapsed = embed(args.model, texts)
    except urllib.error.HTTPError as exc:
        print(f"\n✗ HTTP {exc.code} — 이 모델은 임베딩을 지원하지 않을 수 있습니다.")
        print("  공식 태그를 쓰세요:  ollama pull qwen3-embedding:8b")
        return 1
    except OSError:
        print("\n✗ Ollama 서버에 닿지 못했습니다. `ollama serve` 를 확인하세요.")
        return 1

    per_sec = len(texts) / elapsed
    print(f"\n초당 {per_sec:.1f}개  ({elapsed:.1f}초에 {len(texts)}개)\n")

    print("남은 시간 추정")
    print("─" * 46)
    for label, total in (
        (f"표본 corpus ({SAMPLE_SIZE:,})", min(SAMPLE_SIZE, len(chunks))),
        (f"전체 corpus ({len(chunks):,})", len(chunks)),
    ):
        print(f"  {label:24} {human(total / per_sec):>10}")

    print("\n※ 벤치마크가 함께 돌고 있으면 실제보다 느리게 나옵니다.")
    if per_sec < 3:
        print("※ 너무 느립니다. 0.6B 로 내려가거나 Qwen 을 빼고 진행하는 편이 낫습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
