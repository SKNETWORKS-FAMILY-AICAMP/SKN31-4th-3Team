# chat/urls.py

from django.urls import path
from .views import (
    ChatSessionListCreateView,
    ChatSessionDetailView,
    ChatMessageListView,
    ChatCompletionView,
    ChatStreamView,
)

urlpatterns = [
    # 대화방 목록 조회 및 생성
    path('sessions/', ChatSessionListCreateView.as_view(), name='session_list_create'),
    
    # 특정 대화방 상세 조회 및 삭제
    path('sessions/<int:pk>/', ChatSessionDetailView.as_view(), name='session_detail'),
    
    # 특정 대화방의 대화 메시지 내역 조회
    path('sessions/<int:session_id>/messages/', ChatMessageListView.as_view(), name='session_messages'),
    
    # LLM 실시간 대화 completion (메시지 전송 및 AI 답변 생성)
    path('sessions/<int:session_id>/completion/', ChatCompletionView.as_view(), name='session_completion'),

    # SSE 스트리밍
    path('sessions/<int:session_id>/stream/', ChatStreamView.as_view(), name='chat-stream'),
]