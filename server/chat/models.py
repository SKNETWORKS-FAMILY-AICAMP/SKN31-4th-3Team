# chat/models.py
"""
대화 세션과 메시지.

★ 세션이 "어디서 왔는지"를 기억한다.
  구절 상세에서 '상담 이어가기'로 들어왔다면 그 구절이, 질문에서
  들어왔다면 그 질문이 문맥이다. 이 값이 없으면 대화를 다시 열었을 때
  무엇에 대한 이야기였는지 복원할 수 없다.
"""

from django.conf import settings
from django.db import models


class ChatSession(models.Model):
    """사용자의 대화방(세션)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_sessions",
    )
    title = models.CharField(max_length=255, default="새로운 대화")

    #: 이 대화를 시작시킨 구절. scripture.Verse.id 슬러그를 담는다.
    seed_verse = models.ForeignKey(
        "scripture.Verse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="threads",
    )

    #: 씨앗 구절의 id 를 문자열 그대로. 예: "창.6.10"
    #:
    #: ★ 왜 외래키만으로 부족한가
    #:   화면의 별 2,652개 중 큐레이션 Verse 는 702개뿐이고, 나머지
    #:   1,950개는 BibleVerse(성경전서에서 은하당 150개씩 뽑은 것)다.
    #:   외래키는 Verse 만 가리키므로, 캔버스에서 별 넷 중 셋을 누르면
    #:   가리킬 대상이 없다. 그렇다고 상담에 못 들어가면 안 된다.
    #:
    #:   그래서 문자열은 언제나 남기고, 외래키는 가리킬 수 있을 때만 건다.
    #:   프롬프트 문맥은 이 문자열로 두 표를 차례로 찾는다
    #:   (chat/context.py). Neo4j 도 "창 6:10" 같은 문자열이 키라
    #:   여기서 바로 이어진다.
    seed_verse_ref = models.CharField(max_length=32, blank=True)
    #: 구절 대신 질문에서 시작했다면 그 질문.
    seed_question = models.CharField(max_length=500, blank=True)

    #: 어느 은하와 이야기하는가 (scripture.Galaxy.id / llm_core 페르소나 id).
    #:
    #: ★ 세션에 둔다. 메시지마다가 아니다.
    #:   대화 도중에 인물이 바뀌면 앞뒤 말투가 어긋나 한 사람과 이야기한
    #:   느낌이 사라진다. 다른 인물과 이야기하려면 새 대화를 연다.
    #:
    #: ★ ForeignKey 로 걸지 않는다.
    #:   페르소나는 llm_core 의 프롬프트이고 Galaxy 는 화면용 데이터다.
    #:   지금은 id 가 같지만 앞으로 갈릴 수 있고, 은하가 지워졌다고
    #:   지난 대화가 함께 사라지면 안 된다.
    persona_id = models.CharField(max_length=32, blank=True)

    #: 왜 이 인물이 나왔는지 한 줄. 화면 상단에 조용히 보여 준다.
    #:
    #: ★ 왜 저장하는가 — 다시 계산하면 답이 달라진다.
    #:   근거는 "그때 그 질문"에서 나온 것이다. 제목이 바뀌거나 구절
    #:   데이터가 늘면 같은 대화를 다시 열었을 때 다른 이유가 뜬다.
    #:   배정된 순간을 그대로 적어 둔다.
    #:
    #: ★ 사용자가 직접 고른 대화에서는 비어 있다.
    #:   자기가 누른 은하에 "왜 이 사람인지" 를 설명하는 것은 군더더기다.
    persona_reason = models.CharField(max_length=200, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]  # 최근에 대화한 방이 위로

    def __str__(self):
        return f"[{self.user.email}] {self.title}"


class ChatMessage(models.Model):
    """대화방 내에서 주고받은 메시지."""

    ROLE_CHOICES = (
        ("user", "User"),
        ("assistant", "Assistant"),
        ("system", "System"),
    )

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()

    #: 이 답변이 근거로 삼은 구절. 화면에 출처로 표시된다.
    verse = models.ForeignKey(
        "scripture.Verse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="citations",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]  # 과거 메시지부터

    def __str__(self):
        return f"[{self.role}] {self.content[:20]}..."
