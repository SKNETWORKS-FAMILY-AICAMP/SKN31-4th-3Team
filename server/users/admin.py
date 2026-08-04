"""
users/admin.py
────────────────────────────────────────────────────────────────────────
관리자 화면에 회원을 등록한다.

★ 비어 있으면 관리자 화면에 아무것도 안 보인다.
  "가입이 DB 에 저장됐는지" 확인할 방법이 사라진다. Swagger 는 API 문서일
  뿐 DB 를 보여 주지 않는다.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    기본 UserAdmin 을 그대로 쓰면 username 기준으로 정렬·검색한다.
    우리는 email 이 로그인 ID 이므로 그쪽으로 맞춘다.
    """

    list_display = ('email', 'username', 'mbti', 'is_staff', 'date_joined')
    list_filter = ('mbti', 'is_staff', 'is_active')
    search_fields = ('email', 'username')
    ordering = ('-date_joined',)

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('개인 정보', {'fields': ('username', 'mbti')}),
        ('권한', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('기록', {'fields': ('last_login', 'date_joined')}),
    )
    # 관리자 화면에서 계정을 추가할 때 받을 항목
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'mbti', 'password1', 'password2'),
        }),
    )
