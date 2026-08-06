"""
scripture/eval/providers.py
────────────────────────────────────────────────────────────────────────
임베딩 공급자.

★ 한 인터페이스로 묶는 이유
  벤치마크에서 고른 모델을 나중에 실서비스에서 그대로 쓴다. 여기서 쓴
  코드와 서비스에서 쓸 코드가 다르면, 벤치마크 1등이 실제로도 1등인지
  알 수 없다.

★ 자격증명이 없으면 조용히 빠진다
  키가 없는 공급자는 "쓸 수 없음"으로 표시되고 나머지끼리 비교한다.
  하나가 없다고 벤치마크 전체가 멈추면 아무도 돌리지 않게 된다.
"""

from __future__ import annotations

import hashlib
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class Spec:
    """공급자 하나의 명세. 표에 그대로 찍힌다."""

    name: str
    dim: int
    #: 100만 토큰당 달러. 로컬 모델은 0.
    usd_per_1m: float
    note: str = ""


class Embedder(ABC):
    spec: Spec

    @abstractmethod
    def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        """
        :param is_query:
            질의인가 문서인가. 어떤 모델은 둘을 다르게 다룬다
            (Qwen3 는 질의에만 instruction 을 붙여야 성능이 나온다).
            구분하지 않는 모델은 무시하면 된다.
        """

    @staticmethod
    def available() -> bool:
        return True


# ── OpenAI ──────────────────────────────────────────────────────────


class OpenAIEmbedder(Embedder):
    """text-embedding-3-small / -large."""

    def __init__(self, model: str, dim: int, usd: float):
        self.model = model
        self.spec = Spec(model, dim, usd)
        self._client = None

    @staticmethod
    def available() -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def _get(self):
        if self._client is None:
            from openai import OpenAI

            self._client = OpenAI()
        return self._client

    def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        # 한 번에 너무 많이 보내면 요청 크기 제한에 걸린다.
        out: list[list[float]] = []
        for i in range(0, len(texts), 256):
            batch = texts[i : i + 256]
            response = self._get().embeddings.create(model=self.model, input=batch)
            out.extend(item.embedding for item in response.data)
        return out


# ── Voyage (Anthropic 권장 공급자) ──────────────────────────────────


class VoyageEmbedder(Embedder):
    """
    ★ "클로드 임베딩 모델" 을 찾으면 여기로 온다.
      Anthropic 은 임베딩 모델을 만들지 않고 Voyage 를 권장한다.
    """

    def __init__(self, model: str = "voyage-3", dim: int = 1024, usd: float = 0.06):
        self.model = model
        self.spec = Spec(model, dim, usd, note="Anthropic 권장 공급자")
        self._client = None

    @staticmethod
    def available() -> bool:
        return bool(os.environ.get("VOYAGE_API_KEY"))

    def _get(self):
        if self._client is None:
            import voyageai

            self._client = voyageai.Client()
        return self._client

    def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 128):
            result = self._get().embed(
                texts[i : i + 128],
                model=self.model,
                input_type="query" if is_query else "document",
            )
            out.extend(result.embeddings)
        return out


# ── Qwen3 (로컬) ────────────────────────────────────────────────────

#: Qwen3 는 질의 쪽에만 지시문을 붙였을 때 성능이 크게 오른다.
#: 문서 쪽에는 붙이지 않는 것이 모델 카드의 권장 사용법이다.
QWEN_QUERY_INSTRUCTION = (
    "Instruct: 주어진 질문에 답이 되는 성경 구절을 찾으시오\nQuery: "
)


class QwenEmbedder(Embedder):
    """
    Qwen3-Embedding 계열을 sentence-transformers 로 돌린다.

    ★ 8B 는 대부분의 노트북에서 돌지 않는다.
      FP16 기준 15~16GB VRAM 이 필요하다. GPU 가 없으면 0.6B 로 내려
      가거나(--model qwen0.6b), 호스팅 API 를 쓰는 편이 낫다.
      돌지 않는 모델을 후보에 남겨 두면 벤치마크가 그 자리에서 멈춘다.
    """

    def __init__(self, repo: str, dim: int):
        self.repo = repo
        self.spec = Spec(repo.split("/")[-1], dim, 0.0, note="로컬 실행")
        self._model = None

    @staticmethod
    def available() -> bool:
        try:
            import sentence_transformers  # noqa: F401
        except ImportError:
            return False
        return True

    def _get(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.repo)
        return self._model

    def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        if is_query:
            texts = [QWEN_QUERY_INSTRUCTION + t for t in texts]
        vectors = self._get().encode(texts, normalize_embeddings=True, batch_size=8)
        return [v.tolist() for v in vectors]


# ── Ollama (양자화 로컬 실행) ───────────────────────────────────────


class OllamaEmbedder(Embedder):
    """
    Ollama 로 돌린다. 8B 를 노트북에서 굴리는 현실적인 방법이다.

    ★ 왜 sentence-transformers 가 아닌가
      그쪽은 원본 가중치(FP16)를 그대로 올린다 — 8B 면 15GB 다.
      Ollama 는 양자화된 GGUF 를 쓰고, GPU 메모리가 모자라면 남는 층을
      CPU 로 흘린다. 느려지되 죽지는 않는다.

    ★ 양자화가 임베딩에 미치는 영향은 생성과 다르다
      "Q4 는 Q8 대비 품질 4% 차이" 같은 이야기는 대개 문장 생성 기준이다.
      임베딩은 숫자 자체가 결과라, 미세한 값 변화가 코사인 유사도 순위를
      바꾼다. 얼마나 바뀌는지는 추측할 필요가 없다 — 벤치마크에 Q8 과
      Q4 를 같이 넣고 재면 된다. 그러라고 만든 하네스다.

    ★ 서버가 안 떠 있으면 조용히 빠진다
      `ollama serve` 를 안 켠 사람 때문에 격자 전체가 멈추면 안 된다.

    ★ 아무 GGUF 나 임베딩이 되는 것은 아니다
      GGUF 에 pooling_type 메타데이터가 없으면 Ollama 는 그 모델을
      생성 모델로 보고 /api/embed 에 501 을 돌려준다. 커뮤니티가 올린
      변환본에 이게 빠진 경우가 흔하다. 공식 라이브러리 태그
      (qwen3-embedding:8b 등)에는 들어 있다.
    """

    HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

    #: 한 요청에 담는 글 수.
    #:
    #: ★ 작으면 GPU 가 논다.
    #:   구절 하나는 20~60자로 아주 짧다. 32개씩 보내면 GPU 가 한 번에
    #:   할 일이 순식간에 끝나고, 다음 요청이 올 때까지 놀게 된다.
    #:   화면에는 "GPU 사용률 30%" 로 보이지만 막혀 있는 게 아니라
    #:   일이 안 들어가고 있는 것이다.
    BATCH = int(os.environ.get("OLLAMA_BATCH", "128"))

    #: 동시에 날리는 요청 수.
    #:
    #: ★ 왕복 시간을 가린다.
    #:   요청 하나를 보내고 응답을 기다리는 동안 GPU 는 논다. 몇 개를
    #:   겹쳐 두면 앞 요청을 계산하는 사이에 다음 요청이 도착해 있다.
    #:   너무 올리면 메모리가 터지므로 기본은 보수적으로 둔다.
    CONCURRENCY = int(os.environ.get("OLLAMA_CONCURRENCY", "3"))

    def __init__(self, tag: str, dim: int):
        self.tag = tag
        self.spec = Spec(tag, dim, 0.0, note="Ollama 로컬")

    @classmethod
    def available(cls) -> bool:
        import urllib.error
        import urllib.request

        try:
            with urllib.request.urlopen(f"{cls.HOST}/api/tags", timeout=2):
                return True
        except (urllib.error.URLError, OSError):
            return False

    def _post(self, path: str, body: dict) -> dict:
        import json as _json
        import urllib.request

        request = urllib.request.Request(
            f"{self.HOST}{path}",
            data=_json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=900) as response:
            return _json.loads(response.read())

    def _embed_batch(self, batch: list[str]) -> list[list[float]]:
        import urllib.error

        try:
            return self._post("/api/embed", {"model": self.tag, "input": batch})["embeddings"]
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                # 오래된 Ollama 는 일괄 엔드포인트가 없다. 한 개씩 보낸다.
                return [
                    self._post("/api/embeddings", {"model": self.tag, "prompt": t})["embedding"]
                    for t in batch
                ]
            raise self._explain(exc) from exc

    def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        from concurrent.futures import ThreadPoolExecutor

        if is_query and "embedding" in self.tag.lower():
            texts = [QWEN_QUERY_INSTRUCTION + t for t in texts]

        batches = [texts[i : i + self.BATCH] for i in range(0, len(texts), self.BATCH)]

        # ★ map 이라 순서가 보장된다.
        #   임베딩 순서가 어긋나면 "요한복음 3:16 벡터"가 다른 구절에
        #   붙는다. 검색은 멀쩡히 돌고 결과만 조용히 틀린다 — 가장
        #   찾기 어려운 종류의 버그다.
        with ThreadPoolExecutor(max_workers=self.CONCURRENCY) as pool:
            results = pool.map(self._embed_batch, batches)

        out: list[list[float]] = []
        for vectors in results:
            out.extend(vectors)
        return out

    def _explain(self, exc) -> RuntimeError:
        """
        ★ 원인을 알려 주는 것이 이 함수의 전부다.
          "HTTP Error 501" 만 보면 서버 문제인지 모델 문제인지 알 수 없고,
          검색해 봐도 답이 안 나온다. 실제로는 대개 GGUF 메타데이터 문제다.
        """
        if exc.code in (400, 500, 501):
            return RuntimeError(
                f"{self.tag} 는 임베딩을 지원하지 않습니다 (HTTP {exc.code}).\n"
                "  GGUF 에 pooling_type 메타데이터가 없으면 Ollama 가 생성 모델로\n"
                "  취급합니다. 커뮤니티 변환본에서 흔한 일입니다.\n"
                "  → 공식 태그를 쓰세요:  ollama pull qwen3-embedding:8b"
            )
        return RuntimeError(f"{self.tag} 호출 실패 (HTTP {exc.code})")


# ── 오프라인 대조군 ─────────────────────────────────────────────────


class HashEmbedder(Embedder):
    """
    글자 해시로 만든 가짜 벡터.

    ★ 이게 왜 후보에 있는가 — 바닥값이다.
      진짜 모델의 점수가 이것과 비슷하다면, 그건 모델이 나쁜 게 아니라
      우리 정답셋이나 하네스가 잘못된 것이다. 의미를 전혀 모르는 벡터가
      Recall@10 = 0.4 를 찍는다면 후보 풀이 너무 좁다는 뜻이다.

    네트워크 없이 하네스 자체를 시험할 때도 쓴다.
    """

    def __init__(self, dim: int = 256):
        self.spec = Spec("hash-baseline", dim, 0.0, note="의미 없음 — 바닥값")
        self.dim = dim

    def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        out = []
        for text in texts:
            vec = [0.0] * self.dim
            # 글자 2-gram 을 버킷에 흩뿌린다 (아주 조잡한 어휘 겹침 지표)
            for i in range(len(text) - 1):
                h = hashlib.md5(text[i : i + 2].encode()).digest()
                vec[int.from_bytes(h[:4], "big") % self.dim] += 1.0
            norm = sum(v * v for v in vec) ** 0.5 or 1.0
            out.append([v / norm for v in vec])
        return out


#: `--models` 로 고르는 이름들.
REGISTRY: dict[str, callable] = {
    "small": lambda: OpenAIEmbedder("text-embedding-3-small", 1536, 0.02),
    "large": lambda: OpenAIEmbedder("text-embedding-3-large", 3072, 0.13),
    "voyage": lambda: VoyageEmbedder(),
    # 원본 가중치 (FP16). GPU 16GB 이상이어야 8B 가 돈다.
    "qwen8b": lambda: QwenEmbedder("Qwen/Qwen3-Embedding-8B", 4096),
    "qwen4b": lambda: QwenEmbedder("Qwen/Qwen3-Embedding-4B", 2560),
    "qwen0.6b": lambda: QwenEmbedder("Qwen/Qwen3-Embedding-0.6B", 1024),
    # ── Ollama (양자화). 노트북에서 8B 를 굴리는 현실적인 경로 ──
    #
    # ★ 공식 라이브러리 태그를 기본으로 둔다.
    #   커뮤니티 변환본은 pooling_type 메타데이터가 빠진 경우가 있어
    #   /api/embed 가 501 을 낸다. 공식 태그에는 들어 있다.
    "oll8b": lambda: OllamaEmbedder("qwen3-embedding:8b", 4096),
    "oll4b": lambda: OllamaEmbedder("qwen3-embedding:4b", 2560),
    "oll0.6b": lambda: OllamaEmbedder("qwen3-embedding:0.6b", 1024),
    # 커뮤니티 Q8. 공식보다 정밀도가 높지만 임베딩이 안 될 수 있다.
    # 되면 "양자화를 덜 하면 얼마나 나아지는가" 를 잴 수 있다.
    "q8": lambda: OllamaEmbedder("dengcao/Qwen3-Embedding-8B:Q8_0", 4096),
    "hash": lambda: HashEmbedder(),
}
