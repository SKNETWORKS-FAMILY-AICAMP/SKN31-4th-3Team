"""chat/serializers.py"""

from rest_framework import serializers

from .models import ChatMessage, ChatSession


class ChatMessageSerializer(serializers.ModelSerializer):
    verse_id = serializers.CharField(source="verse.id", read_only=True, default=None)

    class Meta:
        model = ChatMessage
        fields = ("id", "session", "role", "content", "verse_id", "created_at")
        read_only_fields = ("id", "created_at", "verse_id")


class ChatSessionSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.email")
    seed_verse_id = serializers.CharField(source="seed_verse.id", read_only=True, default=None)

    class Meta:
        model = ChatSession
        fields = (
            "id",
            "user",
            "title",
            "seed_verse_id",
            "seed_question",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "user", "created_at", "updated_at", "seed_verse_id")


class ChatSessionDetailSerializer(ChatSessionSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta(ChatSessionSerializer.Meta):
        fields = ChatSessionSerializer.Meta.fields + ("messages",)


class StartThreadSerializer(serializers.Serializer):
    """
    상담 시작 요청.

    ★ 둘 다 비어 있어도 된다.
      아무 문맥 없이 "그냥 이야기하고 싶다"로 시작하는 경우가 있다.
    """

    verse_id = serializers.CharField(required=False, allow_blank=True)
    question = serializers.CharField(required=False, allow_blank=True, max_length=500)


class StartThreadResponseSerializer(serializers.Serializer):
    thread_id = serializers.IntegerField()
    opening = ChatMessageSerializer()


class SendMessageSerializer(serializers.Serializer):
    message = serializers.CharField(required=True, help_text="유저가 입력한 질문/메시지")
