# chat/views.py

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from .models import ChatSession, ChatMessage
from .serializers import (
    ChatSessionSerializer,
    ChatSessionDetailSerializer,
    ChatMessageSerializer,
    SendMessageSerializer,
)

import json
from django.http import StreamingHttpResponse
from llm_core.services import generate_llm_response
from llm_core.services import generate_llm_stream_response
from drf_spectacular.utils import extend_schema
from llm_core.negotiation import EventStreamRenderer, IgnoreClientContentNegotiation


class ChatSessionListCreateView(generics.ListCreateAPIView):
    """
    대화방 목록 조회 및 새 대화방 생성 API
    GET /api/v1/chat/sessions/
    POST /api/v1/chat/sessions/
    """
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # ⚠️ 로그인한 본인의 대화방 목록만 반환
        return ChatSession.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # 대화방 생성 시 현재 로그인한 유저를 자동으로 저장
        serializer.save(user=self.request.user)


class ChatSessionDetailView(generics.RetrieveDestroyAPIView):
    """
    특정 대화방 상세 조회 및 삭제 API
    GET /api/v1/chat/sessions/<int:pk>/
    DELETE /api/v1/chat/sessions/<int:pk>/
    """
    serializer_class = ChatSessionDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)


class ChatMessageListView(generics.ListAPIView):
    """
    특정 대화방의 메시지 목록 조회 API
    GET /api/v1/chat/sessions/<int:session_id>/messages/
    """
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        session_id = self.kwargs.get('session_id')
        
        # 접근하려는 대화방이 본인의 대화방인지 검증
        try:
            session = ChatSession.objects.get(id=session_id, user=self.request.user)
        except ChatSession.DoesNotExist:
            raise PermissionDenied("해당 대화방에 접근 권한이 없습니다.")

        return ChatMessage.objects.filter(session=session)


class ChatCompletionView(APIView):
    """
    사용자 메시지를 받아 LLM 답변을 생성하고 DB에 기록하는 API(동기방식)
    POST /api/v1/chat/sessions/<session_id>/completion/
    """
    permission_classes = [permissions.IsAuthenticated]

    # 👇 Swagger가 Request Body와 Response 형태를 정확히 인지하도록 데코레이터 추가
    @extend_schema(
        request=SendMessageSerializer,
        responses={201: ChatMessageSerializer}
    )
    
    def post(self, request, session_id):
        # 1. 권한 검증: 본인의 대화방인지 확인
        try:
            session = ChatSession.objects.get(id=session_id, user=request.user)
        except ChatSession.DoesNotExist:
            raise PermissionDenied("해당 대화방에 접근 권한이 없습니다.")

        # 2. 요청 데이터 유효성 검사
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_message_text = serializer.validated_data['message']

        # 3. 유저 메시지 DB 저장
        user_msg = ChatMessage.objects.create(
            session=session,
            role='user',
            content=user_message_text
        )

        # 4. 이전 대화 히스토리 수집 (최근 대화 맥락 유지)
        # 최신 유저 메시지를 포함한 전체 히스토리를 dict 리스트 형태로 변환
        history_qs = ChatMessage.objects.filter(session=session).order_by('created_at')
        messages_history = [
            {"role": msg.role, "content": msg.content}
            for msg in history_qs
        ]

        # 5. LLM (OpenAI API) 호출
        try:
            ai_response_text = generate_llm_response(messages_history=messages_history)
        except Exception as e:
            return Response(
                {"error": f"LLM 응답 생성 실패: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # 6. AI 답변 DB 저장
        ai_msg = ChatMessage.objects.create(
            session=session,
            role='assistant',
            content=ai_response_text
        )

        # 7. 세션 update 시간 갱신 (최신 대화순 정렬용)
        session.save()

        # 8. 생성된 AI 답변 반환
        return Response(
            ChatMessageSerializer(ai_msg).data,
            status=status.HTTP_201_CREATED
        )

class ChatStreamView(APIView):
    """
    사용자 메시지를 받아 LLM 답변을 SSE 스트리밍으로 전송하고 DB에 기록하는 API(실시간 스트리밍 방식)
    POST /api/v1/chat/sessions/<session_id>/stream/
    """
    permission_classes = [permissions.IsAuthenticated]

    # ★ Accept: text/event-stream 을 406 으로 막지 않는다 (llm_core/negotiation.py)
    renderer_classes = [EventStreamRenderer]
    content_negotiation_class = IgnoreClientContentNegotiation

    @extend_schema(
        request=SendMessageSerializer,
        responses={200: "text/event-stream"}
    )
    def post(self, request, session_id):
        # 1. 권한 검증: 본인의 대화방인지 확인
        try:
            session = ChatSession.objects.get(id=session_id, user=request.user)
        except ChatSession.DoesNotExist:
            raise PermissionDenied("해당 대화방에 접근 권한이 없습니다.")

        # 2. 요청 데이터 유효성 검사
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_message_text = serializer.validated_data['message']

        # 3. 유저 메시지 DB 저장
        user_msg = ChatMessage.objects.create(
            session=session,
            role='user',
            content=user_message_text
        )

        # 4. 이전 대화 히스토리 수집
        history_qs = ChatMessage.objects.filter(session=session).order_by('created_at')
        messages_history = [
            {"role": msg.role, "content": msg.content}
            for msg in history_qs
        ]

        # 5. SSE 스트림 생성 함수 정의
        def event_stream():
            full_ai_content = ""  # 전체 답변 누적용

            try:
                # LLM 스트리밍 호출
                for chunk in generate_llm_stream_response(messages_history):
                    full_ai_content += chunk
                    # SSE 규격 포맷 전송 ("data: {"content": "..."}\n\n")
                    data = json.dumps({"content": chunk}, ensure_ascii=False)
                    yield f"data: {data}\n\n"

                # 6. 스트리밍 종료 후 전체 완성된 AI 답변을 DB에 저장
                ChatMessage.objects.create(
                    session=session,
                    role='assistant',
                    content=full_ai_content
                )
                session.save()

                # 스트리밍 종료 신호
                yield "data: [DONE]\n\n"

            except Exception as e:
                error_data = json.dumps({"error": f"LLM 스트리밍 실패: {str(e)}"}, ensure_ascii=False)
                yield f"data: {error_data}\n\n"

        # 7. StreamingHttpResponse 반환
        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream'
        )
        response['X-Accel-Buffering'] = 'no'
        response['Cache-Control'] = 'no-cache'
        return response