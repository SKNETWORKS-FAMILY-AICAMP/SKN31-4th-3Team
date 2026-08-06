"""scripture/serializers.py — 프런트 타입과 1:1 로 맞춘 직렬화."""

from rest_framework import serializers

from .models import BibleVerse, Galaxy, Verse


class GalaxySerializer(serializers.ModelSerializer):
    class Meta:
        model = Galaxy
        fields = ("id", "name", "role", "mbti", "tint", "is_center", "order")


#: 캔버스 별의 모티프.
#:
#: ★ 구절마다 달라야 화면이 단조롭지 않다.
#:   전부 같은 모티프면 13개 성운이 같은 무늬로 보인다. 그렇다고 사람이
#:   28,000개를 정할 수는 없으므로 id 로 고르게 흩뿌린다.
#:   같은 구절은 늘 같은 모티프다 — 새로고침할 때마다 바뀌면 안 된다.
MOTIFS = ("light", "water", "wilderness", "dawn", "path", "seed", "mountain", "wind")


class BibleVerseSerializer(serializers.ModelSerializer):
    """
    성경전서 구절을 프런트의 BriefVerseStar 로 내보낸다.

    ★ 큐레이션 구절과 같은 모양으로 맞춘다.
      화면은 두 출처를 구분하지 않는다. depth 로만 갈린다 —
      full 은 스토리·묵상이 있고, brief 는 본문과 출처만 있다.

    ★ 이제 brief 에도 본문이 있다.
      예전에는 662개 연관 구절에 자체 요약만 넣었다(번역본 확인 전이라).
      성경전서를 적재했으므로 summary 자리에 실제 본문이 들어간다.
    """

    galaxy_id = serializers.CharField(read_only=True)
    book_name = serializers.SerializerMethodField()
    summary = serializers.CharField(source="content", read_only=True)
    depth = serializers.SerializerMethodField()
    themes = serializers.SerializerMethodField()
    motif = serializers.SerializerMethodField()
    magnitude = serializers.SerializerMethodField()

    class Meta:
        model = BibleVerse
        fields = (
            "id", "galaxy_id", "order",
            "book_code", "book_name", "chapter", "verse",
            "depth", "summary", "themes", "motif", "magnitude",
        )

    def get_book_name(self, obj) -> str:
        from .books import name_of

        return name_of(obj.book_code)

    def get_depth(self, obj) -> str:
        return Verse.BRIEF

    def get_themes(self, obj) -> list:
        # 주제 태그는 큐레이션에만 있다. 비워 두면 화면이 태그 줄을 안 그린다.
        return []

    def get_motif(self, obj) -> str:
        return MOTIFS[hash_of(obj.id) % len(MOTIFS)]

    def get_magnitude(self, obj) -> float:
        """
        ★ 큐레이션 별보다 어둡게 둔다.
          같은 밝기로 그리면 사람이 고른 702개가 3만 개 속에 묻힌다.
          0.25~0.45 사이로 흩뿌려 성운의 결은 살리되 주인공은 남긴다.
        """
        return round(0.25 + (hash_of(obj.id) % 200) / 1000, 3)


def hash_of(key: str) -> int:
    """
    id 에서 안정적인 정수를 뽑는다.

    ★ 파이썬 내장 hash() 를 쓰지 않는다.
      문자열 해시에 무작위 시드가 걸려 있어 프로세스마다 값이 달라진다.
      서버를 재시작하면 별의 모양과 밝기가 전부 바뀐다.
    """
    import hashlib

    return int.from_bytes(hashlib.md5(key.encode()).digest()[:4], "big")


class VerseSerializer(serializers.ModelSerializer):
    """
    프런트의 VerseStar 에 대응한다.

    ★ 좌표(coord)는 보내지 않는다.
      프런트가 galaxy_id + order 로 파생시킨다. 서버가 좌표까지 들고
      있으면 배치 규칙을 고칠 때마다 DB 를 다시 써야 한다.
    """

    galaxy_id = serializers.CharField(source="galaxy.id", read_only=True)

    class Meta:
        model = Verse
        fields = (
            "id",
            "galaxy_id",
            "order",
            "book_code",
            "book_name",
            "chapter",
            "verse",
            "depth",
            "summary",
            "themes",
            "motif",
            "magnitude",
            "excerpt",
            "attribution",
            "story",
            "meditation",
            "related_prompts",
        )


class AskRequestSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=500, help_text="사용자가 입력한 고민")
    attempt = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        max_value=99,
        help_text='"다른 구절 보기"를 누른 횟수. variant 를 순환시킨다.',
    )


class AskResultSerializer(serializers.Serializer):
    """응답 형태 고정용. 스키마 문서에 그대로 나온다."""

    question = serializers.CharField()
    intent = serializers.CharField()
    empathy = serializers.CharField()
    reflection = serializers.CharField()
    verse_ids = serializers.ListField(child=serializers.CharField())

    #: 검색이 고른 구절의 내용.
    #:
    #: ★ id 만으로는 부족하다.
    #:   화면의 별 목록에는 은하당 150절만 올라간다. 벡터 검색은
    #:   31,077절 전체에서 고르므로, 목록에 없는 구절을 고르면 카드가
    #:   빈 채로 뜬다. 내용을 함께 보내면 그 제약이 사라진다.
    #:
    #: ★ 폴백일 때는 비어 있다.
    #:   검색을 못 쓰는 상태에서는 예전처럼 큐레이션 702절의 id 만
    #:   나간다. 그건 화면 목록에 다 있으므로 목록에서 찾으면 된다.
    verses = serializers.ListField(child=serializers.DictField(), required=False)

    follow_ups = serializers.ListField(child=serializers.CharField())

    #: 이 고민을 들어 줄 인물의 은하.
    #: 화면은 id 로 좌표·색을 찾고, 이름은 문장에 그대로 쓴다.
    galaxy_id = serializers.CharField()
    galaxy_name = serializers.CharField()
    galaxy_reason = serializers.CharField()
