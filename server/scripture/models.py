"""
scripture/models.py
────────────────────────────────────────────────────────────────────────
은하와 구절.

★ 좌표를 저장하지 않는다.
  화면 좌표는 프런트의 galaxy/placement.ts 가 "은하 안 순번"에서 파생시킨다.
  서버가 좌표를 들고 있으면 배치 규칙을 바꿀 때마다 DB 를 다시 써야 하고,
  두 곳의 규칙이 어긋나는 순간 별이 성운 밖에 뜬다.
  서버의 책임은 order(순번)까지다.

★ id 는 슬러그다 (예: gen-1-3).
  URL, 카메라 목표, 추천 결과 참조가 모두 이 값을 쓴다. 자동 증가 정수를
  쓰면 프런트가 이미 가진 참조가 전부 깨진다.
"""

from django.db import models


class Galaxy(models.Model):
    """예수 그리스도 1 + 12제자 = 13개."""

    id = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=32)
    role = models.CharField(max_length=64)
    mbti = models.CharField(max_length=4)

    #: 성운 색. 중심 은하는 색을 주지 않으므로 비어 있다.
    tint = models.CharField(max_length=7, blank=True)
    is_center = models.BooleanField(default=False)

    #: 화면 배치 순서. 프런트가 이 값으로 공전 위상을 정한다.
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        verbose_name = "은하"
        verbose_name_plural = "은하"

    def __str__(self) -> str:
        return f"{self.name}의 은하 ({self.mbti})"


class Verse(models.Model):
    """
    탐색 가능한 구절 별.

    depth 로 두 층을 구분한다.
      full  — 인용·스토리·묵상까지 갖춘 큐레이션 구절. 추천의 대상이다.
      brief — 은하를 채우는 연관 구절. 출처와 요약 한 줄만 갖는다.
    """

    FULL = "full"
    BRIEF = "brief"
    DEPTH_CHOICES = ((FULL, "큐레이션"), (BRIEF, "연관 구절"))

    id = models.CharField(primary_key=True, max_length=32)
    galaxy = models.ForeignKey(Galaxy, on_delete=models.CASCADE, related_name="verses")

    #: 은하 안에서의 순번. 프런트가 좌표를 파생시키는 유일한 입력이다.
    order = models.PositiveSmallIntegerField(default=0)

    book_code = models.CharField(max_length=8)
    book_name = models.CharField(max_length=16)
    chapter = models.PositiveSmallIntegerField()
    verse = models.PositiveSmallIntegerField()

    depth = models.CharField(max_length=8, choices=DEPTH_CHOICES, default=BRIEF)
    summary = models.TextField()
    themes = models.JSONField(default=list)
    motif = models.CharField(max_length=16)
    magnitude = models.FloatField(default=0.5)

    """
    ★ 인용 관련 필드가 비어 있을 수 있다.
      번역본 저작권을 확인할 수 없는 인용을 662건 싣지 않기 위해,
      연관 구절은 출처와 자체 요약만 갖는다. 정식 번역본을 확보하면
      이 필드를 채우는 것으로 두 층이 같은 화면을 쓰게 된다.
    """
    excerpt = models.CharField(max_length=120, blank=True)
    attribution = models.CharField(max_length=32, blank=True)
    story = models.TextField(blank=True)
    meditation = models.TextField(blank=True)
    related_prompts = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["galaxy__order", "order"]
        verbose_name = "구절"
        verbose_name_plural = "구절"
        indexes = [
            models.Index(fields=["depth"]),
            models.Index(fields=["galaxy", "order"]),
        ]

    def __str__(self) -> str:
        return f"{self.book_name} {self.chapter}:{self.verse}"


class BibleVerse(models.Model):
    """
    성경전서 31,077절.

    ★ Verse(큐레이션 702절)와 별개의 표다.
      Verse 는 은하에 배정되고 스토리·묵상을 갖는, 화면에 별로 뜨는 것이다.
      이쪽은 검색을 위한 원본이고 화면에 직접 뜨지 않는다. 한 표에 합치면
      "은하 없는 별" 3만 개가 생겨서 캔버스가 무너진다.

      둘은 book_code·chapter·verse 로 이어진다. 외래키를 걸지 않는 이유는
      큐레이션이 먼저 있었고, 성경전서 적재가 실패하거나 되돌려져도
      기존 702절이 영향을 받으면 안 되기 때문이다.

    ★ 임베딩 컬럼이 여기 없다
      pgvector 의 vector 타입은 Postgres 전용이라, 모델에 올리면 SQLite 로
      개발·테스트하는 사람의 migrate 가 그 자리에서 죽는다.
      임베딩은 마이그레이션에서 raw SQL 로 붙이고(Postgres 일 때만),
      검색도 raw SQL 로 한다. ORM 으로 벡터 연산자를 감싸 봐야
      `ORDER BY embedding <=> %s` 한 줄보다 복잡해지기만 한다.
      자세한 이유는 scripture/migrations/0005_bibleverse_embedding.py 참조.
    """

    #: '창.1.1' 형태. 정답셋·검색 결과·캐시가 전부 이 표기를 쓴다.
    id = models.CharField(primary_key=True, max_length=24)

    book_code = models.CharField(max_length=8)
    #: 정경 순서. 목록 정렬에 쓴다 (scripture/books.py).
    book_order = models.PositiveSmallIntegerField()
    chapter = models.PositiveSmallIntegerField()
    verse = models.PositiveSmallIntegerField()
    content = models.TextField()

    #: 상담에 그대로 건네도 되는가 (scripture/tone.py 가 판단한 값을 굳힌 것).
    #:
    #: ★ 조회할 때 계산하지 않고 저장해 둔다.
    #:   구간표는 사람이 고치는 것이고, 고친 뒤 무엇이 바뀌었는지
    #:   SQL 로 세어 볼 수 있어야 한다.
    tone = models.CharField(max_length=8, default="neutral", db_index=True)

    #: 상담 검색 공간에 남길 것인가 (scripture/usage.py).
    #:
    #: ★ 지우지 않고 표시만 한다.
    #:   "구백삼십 세를 살고 죽었더라" 도 성경 본문이다. 판단이 바뀌면
    #:   되돌릴 수 있어야 하고, 무엇을 왜 뺐는지 SQL 로 볼 수 있어야 한다.
    usable = models.BooleanField(default=True, db_index=True)

    #: 어느 은하에 속하는가. 배정되지 않았으면 빈 문자열.
    #:
    #: ★ ForeignKey 를 걸지 않는다.
    #:   Galaxy 는 화면용 데이터이고 이쪽은 검색용 원본이다. 은하 구성을
    #:   바꾼다고 3만 절이 CASCADE 로 사라지면 안 된다.
    galaxy_id = models.CharField(max_length=32, blank=True, db_index=True)

    #: 캔버스에 별로 띄울 것인가.
    #:
    #: ★ 배정과 노출은 다른 문제다.
    #:   28,424절을 전부 별로 그리면 매 프레임 그만큼을 투영하고 정렬해야
    #:   한다. 지금 702개를 그리는 구조에서 40배다. 검색은 전부 쓰고,
    #:   화면에는 은하마다 상위 몇 개만 올린다.
    on_canvas = models.BooleanField(default=False, db_index=True)

    #: 은하 안에서의 순번. 프런트가 좌표를 파생시키는 입력이다 (Verse 와 같은 규칙).
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["book_order", "chapter", "verse"]
        verbose_name = "성경 구절"
        verbose_name_plural = "성경 구절"
        indexes = [
            models.Index(fields=["book_code", "chapter"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["book_code", "chapter", "verse"],
                name="unique_bible_verse",
            )
        ]

    def __str__(self) -> str:
        from .books import name_of

        return f"{name_of(self.book_code)} {self.chapter}:{self.verse}"


class EmbeddingRun(models.Model):
    """
    어떤 모델로 임베딩을 적재했는가.

    ★ 왜 기록하는가 — 조용히 틀리는 것을 막는다
      구절은 A 모델로 넣고 질문은 B 모델로 임베딩하면, 두 벡터가 같은
      공간에 있지 않다. 그런데 코사인 유사도는 그래도 숫자를 내놓는다.
      오류도 경고도 없이 검색 결과만 엉망이 되고, 화면에서는 "추천이
      좀 이상하네" 로만 보인다. 원인을 찾는 데 며칠이 걸리는 종류다.

      적재할 때 남겨 두면 검색 쪽이 대조할 수 있다.

    ★ 행이 하나만 있는 표다
      다시 적재하면 덮어쓴다. 이력을 쌓는 것이 목적이 아니라 "지금 DB 에
      들어 있는 벡터가 무엇인가" 하나를 확실히 하는 것이 목적이다.
    """

    #: providers.REGISTRY 의 키 (예: "oll8b")
    model_key = models.CharField(max_length=32)
    #: 실제 모델 이름 (예: "qwen3-embedding:8b")
    model_name = models.CharField(max_length=120)
    #: 컬럼에 저장된 차원. 모델 원본 차원과 다를 수 있다(잘라 넣으므로).
    dim = models.PositiveIntegerField()
    #: 이번에 채운 절 수
    verses = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "임베딩 적재 기록"
        verbose_name_plural = "임베딩 적재 기록"

    def __str__(self) -> str:
        return f"{self.model_name} · {self.dim}차원 · {self.verses:,}절"
