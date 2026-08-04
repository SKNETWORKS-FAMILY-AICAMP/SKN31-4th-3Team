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
