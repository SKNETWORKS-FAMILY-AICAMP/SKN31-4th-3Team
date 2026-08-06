"""chat/serializers.py"""

from rest_framework import serializers

from llm_core.prompts import opening_line

from scripture.models import Verse

from .models import ChatMessage, ChatSession


class ChatMessageSerializer(serializers.ModelSerializer):
    verse_id = serializers.CharField(source="verse.id", read_only=True, default=None)

    class Meta:
        model = ChatMessage
        fields = ("id", "session", "role", "content", "verse_id", "created_at")
        read_only_fields = ("id", "created_at", "verse_id")


class ChatSessionSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.email")

    #: 이 대화를 시작시킨 구절.
    #:
    #: ★ 쓰기가 가능해야 한다.
    #:   read_only 로 두었더니 화면이 구절을 보낼 방법이 없었고, 그래서
    #:   seed_verse 가 언제나 비어 있었다. 그 값이 비면 상담 프롬프트에
    #:   구절도 그래프 맥락도 안 들어간다 — 화면은 멀쩡하고 답만 밋밋해진다.
    #:
    #: ★ 외래키로 검증하지 않는다.
    #:   PrimaryKeyRelatedField(queryset=Verse.objects.all()) 로 뒀더니
    #:   캔버스의 BibleVerse 구절(1,950개)이 전부 400 을 받았다.
    #:   "유효하지 않은 pk 창.6.10" — 별 넷 중 셋이 상담에 못 들어갔다.
    #:
    #:   구절은 대화를 풍부하게 하는 재료이지 대화의 조건이 아니다.
    #:   문자열로 받아 그대로 저장하고, 가리킬 수 있는 구절이면
    #:   외래키도 함께 건다(perform_create). 못 찾아도 대화는 열린다.
    seed_verse_id = serializers.CharField(
        source="seed_verse_ref",
        required=False,
        allow_blank=True,
        allow_null=True,
        default="",
    )

    def validate_seed_verse_id(self, value):
        """None 을 빈 문자열로. 화면이 null 을 보낼 수 있다."""
        return value or ""

    #: 이 페르소나의 첫 인사.
    #:
    #: ★ 서버가 내려준다.
    #:   인사말은 페르소나 정의(llm_core/prompts)에 있다. 화면이 따로
    #:   들고 있으면 인물을 고칠 때 두 곳을 고쳐야 하고, 한쪽만 고치면
    #:   베드로가 요한의 인사를 한다.
    #:
    #: ★ LLM 을 부르지 않는다.
    #:   첫 인사를 모델에게 만들게 하면 대화방을 여는 데 몇 초가 걸리고
    #:   그동안 사용자는 빈 화면을 본다. 인사는 미리 정해 둔 문장이다.
    opening = serializers.SerializerMethodField()

    def get_opening(self, obj) -> str:
        return opening_line(obj.persona_id or None)

    #: 마지막으로 오간 말 한 토막.
    #:
    #: ★ 사이드바 목록이 이걸 쓴다.
    #:   제목만 있으면 "새로운 대화" 가 여러 개일 때 어느 것이 어느 것인지
    #:   알 수 없다. 마지막 말이 그 대화를 가장 잘 가리킨다.
    #:
    #: ★ 메시지를 통째로 싣지 않는다.
    #:   목록에 대화 전체를 실어 나르면 방이 스무 개만 돼도 응답이 무거워진다.
    #:   내용은 그 방을 열 때 상세(ChatSessionDetailSerializer)에서 온다.
    last_message = serializers.SerializerMethodField()

    def get_last_message(self, obj) -> str:
        last = obj.messages.order_by("-created_at").first()
        return last.content if last else ""

    class Meta:
        model = ChatSession
        fields = (
            "id",
            "user",
            "title",
            "seed_verse_id",
            "seed_question",
            "persona_id",
            "persona_reason",
            "opening",
            "last_message",
            "created_at",
            "updated_at",
        )
        # persona_id 는 쓰기 가능하다 — 화면이 은하를 지정할 수 있어야 한다.
        # 비워 두면 서버가 추천으로 채운다 (ChatSessionListCreateView.perform_create).
        # persona_reason 은 서버가 배정할 때만 쓴다. 화면이 보내는 값은 무시한다.
        read_only_fields = (
            "id",
            "user",
            "created_at",
            "updated_at",
            "opening",
            "last_message",
            "persona_reason",
        )


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
