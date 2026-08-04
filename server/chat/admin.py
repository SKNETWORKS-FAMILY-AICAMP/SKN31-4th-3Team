"""chat/admin.py — 대화방과 메시지를 관리자 화면에서 확인한다."""

from django.contrib import admin

from .models import ChatMessage, ChatSession


class ChatMessageInline(admin.TabularInline):
    """
    대화방을 열면 주고받은 말이 그 안에 보인다.

    메시지를 따로 뒤지지 않아도 "이 대화가 어떻게 흘렀는지"를 한 화면에서
    읽을 수 있다 — LLM 답변이 제대로 저장됐는지 확인할 때 이게 가장 빠르다.
    """

    model = ChatMessage
    extra = 0
    fields = ('role', 'content', 'verse', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'title', 'created_at', 'updated_at')
    list_filter = ('created_at',)
    search_fields = ('title', 'user__email')
    inlines = [ChatMessageInline]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'session', 'role', 'short_content', 'created_at')
    list_filter = ('role', 'created_at')
    search_fields = ('content',)

    @admin.display(description='내용')
    def short_content(self, obj):
        # 목록에서 본문 전체를 펴면 한 줄이 화면을 넘어간다
        return obj.content[:60] + ('…' if len(obj.content) > 60 else '')
