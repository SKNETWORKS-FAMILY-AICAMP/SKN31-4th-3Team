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
    #: 구절 대신 질문에서 시작했다면 그 질문.
    seed_question = models.CharField(max_length=500, blank=True)

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
