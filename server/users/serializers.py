"""users/serializers.py"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()

#: 16가지 MBTI. 대소문자 구분 없이 받아 대문자로 저장한다.
VALID_MBTI = [
    'INTJ', 'INTP', 'ENTJ', 'ENTP',
    'INFJ', 'INFP', 'ENFJ', 'ENFP',
    'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
    'ISTP', 'ISFP', 'ESTP', 'ESFP',
]


def normalize_mbti(value):
    """
    소문자로 적어도 받아 주고, 16유형이 아니면 거절한다.

    ★ 판정은 여기 한 곳에서만 한다.
      모델 choices 에도 같은 목록을 두면 대문자 변환이 일어나기 전에
      모델 검증이 걸려, 사용자가 맞게 적은 "infp"가 거부된다.
    """
    upper = value.strip().upper()
    if upper not in VALID_MBTI:
        raise serializers.ValidationError('올바른 MBTI 유형(예: INFP, ENTP 등)을 입력해 주세요.')
    return upper


class RegisterSerializer(serializers.ModelSerializer):
    """회원가입 전용."""

    password = serializers.CharField(write_only=True, min_length=8)
    #: 필수. 프론트도 가입 폼에서 비운 채 넘어가지 못하게 막는다.
    mbti = serializers.CharField(required=True, allow_blank=False, max_length=4)

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'password', 'mbti')

    def validate_mbti(self, value):
        return normalize_mbti(value)

    def create(self, validated_data):
        # 비밀번호는 create_user 가 해싱해 저장한다
        return User.objects.create_user(
            email=validated_data['email'],
            username=validated_data['username'],
            password=validated_data['password'],
            mbti=validated_data['mbti'],
        )


class UserSerializer(serializers.ModelSerializer):
    """유저 정보 조회 전용."""

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'mbti', 'date_joined')
        read_only_fields = fields


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    본인 정보 수정. 지금은 MBTI 만 바꿀 수 있다.

    ★ 조회용과 나눠 두는 이유
      UserSerializer 는 모든 필드가 읽기 전용이다. 그걸 그대로 PATCH 에
      쓰면 요청은 200 을 돌려주는데 값은 바뀌지 않는다 — 화면에서는
      저장된 것처럼 보이고 새로고침하면 되돌아간다. 가장 찾기 어려운
      종류의 버그다.

    ★ 왜 PATCH 가 필요한가
      화면 오른쪽 목록에서 다른 유형을 골랐을 때 그 선택이 계정에 남아야
      한다. 이 엔드포인트가 없으면 유형은 가입 때 한 번 정하면 끝이 된다.
    """

    class Meta:
        model = User
        #: 이름도 바꿀 수 있다. 이메일은 로그인 아이디라 여기서 열지 않는다 —
        #: 바꾸려면 본인 확인 절차가 따라붙어야 하고, 그것은 별도의 일이다.
        fields = ('username', 'mbti')

    def validate_mbti(self, value):
        return normalize_mbti(value)

    def validate_username(self, value):
        """
        빈 이름을 막는다.

        ★ 공백만 넣은 경우도 막는다.
          "   " 는 required 검사를 통과한다. 그대로 저장되면 화면 곳곳의
          "○○님" 이 "님" 이 되고, 어디서 깨졌는지 찾기 어렵다.
        """
        name = value.strip()
        if not name:
            raise serializers.ValidationError('이름을 비워 둘 수 없습니다.')
        return name
