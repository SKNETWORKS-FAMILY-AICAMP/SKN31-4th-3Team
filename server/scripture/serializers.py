"""scripture/serializers.py — 프런트 타입과 1:1 로 맞춘 직렬화."""

from rest_framework import serializers

from .models import Galaxy, Verse


class GalaxySerializer(serializers.ModelSerializer):
    class Meta:
        model = Galaxy
        fields = ("id", "name", "role", "mbti", "tint", "is_center", "order")


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
    follow_ups = serializers.ListField(child=serializers.CharField())
