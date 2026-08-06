# chat/views.py

from django.db.models import Count
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
from .context import for_session as build_verse_context
from drf_spectacular.utils import extend_schema
from llm_core.matching import recommend
from llm_core.negotiation import EventStreamRenderer, IgnoreClientContentNegotiation
from scripture.intents import match_intent, theme_labels


class ChatSessionListCreateView(generics.ListCreateAPIView):
    """
    대화방 목록 조회 및 새 대화방 생성 API
    GET /api/v1/chat/sessions/
    POST /api/v1/chat/sessions/
    """
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        로그인한 본인의 대화방만, 최근 것부터.

        ★ 빈 방은 빼고 준다.
          대화방은 상담 화면에 들어서는 순간 만들어진다. 열었다가 아무
          말도 안 하고 나가면 "새로운 대화" 가 하나 남고, 그런 것이 쌓이면
          사이드바가 빈 방 목록이 된다. 브라우저에 남기는 쪽(threadStore)도
          같은 규칙을 쓴다 — 두 출처가 다르게 보이면 안 된다.

        ★ 정렬을 명시한다.
          order_by 가 없으면 순서가 DB 마음이다. 지금은 우연히 id 순으로
          와서 "최근 대화가 맨 아래" 로 보인다.
        """
        return (
            ChatSession.objects.filter(user=self.request.user)
            .annotate(message_count=Count("messages"))
            .filter(message_count__gt=0)
            .order_by("-updated_at")
        )

    def perform_create(self, serializer):
        """
        대화방을 만든다.

        ★ 은하를 고르지 않았으면 골라 준다.
          홈에서 바로 질문한 경우 persona_id 가 비어 있다. 그때는
          질문 주제와 사용자 MBTI 로 열두 제자 중 하나를 추천한다.
          (중심 은하는 빼둔다 — 고르지 않았을 때 늘 예수가 나오면
           열두 은하를 만든 의미가 없다)

        ★ 사용자가 고른 값은 절대 덮지 않는다.
          구절에서 이어 왔거나 은하를 직접 눌렀다면 그 선택이 이긴다.
          그때는 근거도 비워 둔다 — 자기가 고른 것에 이유를 붙이지 않는다.
        """
        user = self.request.user
        persona_id = (serializer.validated_data.get("persona_id") or "").strip()
        reason = ""

        if not persona_id:
            question = (serializer.validated_data.get("title") or "").strip()
            theme = match_intent(question) if question else None
            label = theme_labels().get(theme) if theme else None
            match = recommend(
                theme,
                getattr(user, "mbti", "") or None,
                theme_label=label,
                exclude_center=True,
            )
            persona_id = match.galaxy_id
            reason = match.reason

        serializer.save(user=user, persona_id=persona_id, persona_reason=reason)


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

        # 5. LLM 호출 — 이 세션의 페르소나로
        #
        # ★ 씨앗 구절과 그래프 맥락을 함께 넣는다.
        #   구절만 넣으면 "이 구절이 무슨 뜻인가" 를 설명하는 답이 나온다.
        #   그 구절에 등장한 인물이 무엇을 겪고 무엇을 지나갔는지가 있으면
        #   "그 사람도 여기 있었습니다" 쪽으로 말이 옮겨 간다.
        try:
            ai_response_text = generate_llm_response(
                messages_history=messages_history,
                persona_id=session.persona_id or None,
                verse_context=build_verse_context(session, user_message_text),
            )
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

        # ★ 스트림이 시작되기 전에 만든다.
        #   제너레이터 안에서 만들면 Neo4j 조회가 첫 조각을 늦춘다.
        #   사용자에게는 "답이 안 나온다" 로 보이는 구간이다.
        verse_context = build_verse_context(session, user_message_text)

        # 5. SSE 스트림 생성 함수 정의
        def event_stream():
            full_ai_content = ""  # 전체 답변 누적용

            try:
                # LLM 스트리밍 호출
                for chunk in generate_llm_stream_response(
                    messages_history,
                    persona_id=session.persona_id or None,
                    verse_context=verse_context,
                ):
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