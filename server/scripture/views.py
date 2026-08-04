"""
scripture/views.py
────────────────────────────────────────────────────────────────────────
구절 탐색 API.

★ 읽기는 인증 없이 열어 둔다.
  은하수를 둘러보고 구절을 읽는 것까지는 로그인 없이 가능해야 한다.
  로그인은 "대화를 저장하고 이어가는" 시점에 필요하다.
  (질문·답변 자체는 기록이 남지 않으므로 AllowAny 로 둔다)
"""

from django.db.models import Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Galaxy, Verse
from .recommend import recommend
from .serializers import (
    AskRequestSerializer,
    AskResultSerializer,
    GalaxySerializer,
    VerseSerializer,
)


class GalaxyListView(generics.ListAPIView):
    """
    은하 13개.
    GET /api/v1/scripture/galaxies/
    """

    queryset = Galaxy.objects.all()
    serializer_class = GalaxySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class VerseListView(generics.ListAPIView):
    """
    구절 전체 (702개).
    GET /api/v1/scripture/verses/?galaxy=peter&depth=full

    ★ 페이지를 나누지 않는다.
      프런트는 첫 프레임에 전체 별을 그려야 한다. 나눠 받으면 은하가
      조각조각 나타난다. 700건 남짓이고 정적인 데이터라 한 번에 준다.
    """

    serializer_class = VerseSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = Verse.objects.select_related("galaxy").all()
        galaxy = self.request.query_params.get("galaxy")
        depth = self.request.query_params.get("depth")
        if galaxy:
            queryset = queryset.filter(galaxy_id=galaxy)
        if depth:
            queryset = queryset.filter(depth=depth)
        return queryset


class VerseDetailView(generics.RetrieveAPIView):
    """
    구절 하나.
    GET /api/v1/scripture/verses/<slug>/
    """

    queryset = Verse.objects.select_related("galaxy").all()
    serializer_class = VerseSerializer
    permission_classes = [permissions.AllowAny]


class AskView(APIView):
    """
    고민 → 공감·묵상·추천 구절.
    POST /api/v1/scripture/ask/

    ★ 여기서 위기 판정을 하더라도 프런트 판정을 대체하지 않는다.
      프런트는 요청 이전에 스스로 판정하고, 위기로 보이면 이 API 를
      호출하지 않는다. 서버가 죽어도 안전 안내는 떠야 하기 때문이다.
    """

    permission_classes = [permissions.AllowAny]

    @extend_schema(request=AskRequestSerializer, responses={200: AskResultSerializer})
    def post(self, request):
        serializer = AskRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = recommend(
            question=serializer.validated_data["question"],
            attempt=serializer.validated_data.get("attempt", 0),
        )
        return Response(AskResultSerializer(result).data)
