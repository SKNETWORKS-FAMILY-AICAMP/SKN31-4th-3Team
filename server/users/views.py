"""users/views.py"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import RegisterSerializer, UserSerializer, UserUpdateSerializer

User = get_user_model()


class SafeTokenRefreshView(TokenRefreshView):
    """
    토큰 재발급. 사라진 사용자를 가리키는 토큰도 조용히 거절한다.

    ★ 실제로 났던 고장이다
      SQLite 로 개발하다 Postgres 로 옮겼더니, 브라우저에 남아 있던
      refresh 토큰이 새 DB 에 없는 user_id 를 가리켰다. SimpleJWT 는
      그 사용자를 조회하다 User.DoesNotExist 를 그대로 올렸고,
      DRF 가 잡지 못해 500 이 났다.

    ★ 왜 401 이 맞는가
      서버가 고장 난 것이 아니다. "이 토큰으로는 안 된다" 는 뜻이고,
      그건 인증 실패다. 500 으로 두면
        - 화면은 "서버 오류" 로 읽어 재시도를 반복하고
        - 로그가 스택트레이스로 뒤덮여 진짜 오류가 묻히고
        - 모니터링이 켜져 있으면 새벽에 알림이 울린다

    ★ DB 를 갈아 끼우는 상황은 개발 중에만 나는 게 아니다
      계정을 지운 사용자(탈퇴)의 브라우저에도 같은 토큰이 남아 있다.
      탈퇴를 만든 이상 이 경로는 반드시 지나간다.
    """

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except ObjectDoesNotExist as exc:
            raise InvalidToken("이 토큰의 사용자를 찾을 수 없습니다.") from exc


class RegisterView(generics.CreateAPIView):
    """
    회원가입
    POST /api/v1/auth/register/
    """

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class UserMeView(generics.RetrieveUpdateDestroyAPIView):
    """
    본인 정보 조회·수정·탈퇴
    GET    /api/v1/auth/me/
    PATCH  /api/v1/auth/me/   (이름·MBTI 변경)
    DELETE /api/v1/auth/me/   (회원 탈퇴)

    ★ 탈퇴는 계정 행을 지운다
      ChatSession 이 user 에 CASCADE 로 걸려 있어 대화방과 메시지가 함께
      사라진다. 별도의 정리 코드를 두지 않는 이유는, 두 곳에서 지우면
      한쪽만 도는 상황이 반드시 생기기 때문이다. 지우는 규칙은 모델에
      한 번만 적어 둔다.

    ★ 비활성화가 아니라 삭제다
      "탈퇴했는데 데이터는 남아 있다" 는 설명하기 어렵고, 개인정보 관점에서
      약속을 지키기도 어렵다. 화면에서 두 단계로 확인을 받는다.
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return UserUpdateSerializer if self.request.method in ("PUT", "PATCH") else UserSerializer

    def get_object(self):
        return self.request.user
