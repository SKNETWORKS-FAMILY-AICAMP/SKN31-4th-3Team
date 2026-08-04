# users/urls.py

from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import RegisterView, UserMeView

urlpatterns = [
    # 회원가입
    path('register/', RegisterView.as_view(), name='auth_register'),
    
    # SimpleJWT 제공 로그인 (Access & Refresh 토큰 발급)
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    
    # SimpleJWT 제공 토큰 재발급 (Refresh 토큰 전달시 새로운 Access 토큰 발급)
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # 내 정보 조회
    path('me/', UserMeView.as_view(), name='auth_me'),
]