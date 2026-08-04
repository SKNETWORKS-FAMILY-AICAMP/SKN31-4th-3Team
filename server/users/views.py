"""users/views.py"""

from django.contrib.auth import get_user_model
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated

from .serializers import RegisterSerializer, UserSerializer, UserUpdateSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """
    회원가입
    POST /api/v1/auth/register/
    """

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class UserMeView(generics.RetrieveUpdateAPIView):
    """
    본인 정보 조회·수정
    GET   /api/v1/auth/me/
    PATCH /api/v1/auth/me/   (MBTI 변경)
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return UserUpdateSerializer if self.request.method in ("PUT", "PATCH") else UserSerializer

    def get_object(self):
        return self.request.user
