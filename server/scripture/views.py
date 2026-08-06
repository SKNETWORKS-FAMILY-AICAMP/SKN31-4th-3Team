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

from .models import BibleVerse, Galaxy, Verse
from .recommend import recommend
from .serializers import (
    AskRequestSerializer,
    AskResultSerializer,
    BibleVerseSerializer,
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

    def list(self, request, *args, **kwargs):
        """
        큐레이션 구절 + 성경전서에서 캔버스로 뽑힌 구절.

        ★ 한 목록으로 준다.
          화면은 두 출처를 구분하지 않는다. 나눠 주면 프런트가 두 번
          받아 합치고, 그 사이 은하가 반쯤 그려진 상태가 보인다.

        ★ order 를 겹치지 않게 밀어 준다.
          프런트는 galaxy_id + order 로 좌표를 만든다. 두 표가 각각
          0부터 매기고 있으므로 그대로 합치면 별 두 개가 정확히 같은
          자리에 겹쳐 그려진다 — 하나가 사라진 것처럼 보인다.
        """
        curated = self.get_serializer(self.get_queryset(), many=True).data

        extra = BibleVerse.objects.filter(on_canvas=True)
        if galaxy := request.query_params.get("galaxy"):
            extra = extra.filter(galaxy_id=galaxy)
        if request.query_params.get("depth") == Verse.FULL:
            # full 만 달라고 했으면 성경전서는 해당 없다 (전부 brief 다)
            extra = extra.none()

        offset: dict[str, int] = {}
        for row in curated:
            gid = row["galaxy_id"]
            offset[gid] = max(offset.get(gid, 0), row["order"] + 1)

        rows = BibleVerseSerializer(extra, many=True).data
        for row in rows:
            row["order"] += offset.get(row["galaxy_id"], 0)

        return Response(curated + rows)


class VerseDetailView(generics.RetrieveAPIView):
    """
    구절 하나.
    GET /api/v1/scripture/verses/<slug>/
    """

    queryset = Verse.objects.select_related("galaxy").all()
    serializer_class = VerseSerializer
    permission_classes = [permissions.AllowAny]


def _mbti_of(user) -> str | None:
    """
    로그인했으면 유형을, 아니면 None.

    ★ 로그인을 요구하지 않는다.
      처음 온 사람이 질문 한 줄 던져 보는 것이 이 서비스의 입구다.
      거기에 가입을 세우면 대부분은 그냥 나간다. 유형이 없으면
      추천은 주제만 보고 고른다 — 결과가 없어지는 게 아니라 덜 개인적일 뿐이다.
    """
    if not getattr(user, "is_authenticated", False):
        return None
    return getattr(user, "mbti", "") or None


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
            user_mbti=_mbti_of(request.user),
        )
        return Response(AskResultSerializer(result).data)
