"""
users/models.py
────────────────────────────────────────────────────────────────────────
이메일 기반 커스텀 유저.

★ MBTI 는 가입 시 반드시 받는다.
  화면 오른쪽의 16유형 선택은 "지금 이 결과 가까운 은하"를 고르는
  손잡이지만, 계정에 남겨 두면 매번 고르지 않아도 되고 오른쪽 목록에서
  자기 유형이 조용히 빛난다. 비워 두면 그 연출이 통째로 사라지므로
  프론트도 가입 폼에서 필수로 막는다.

  성격을 규정하는 값이 아니며 언제든 바꿀 수 있다.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)

    """
    ★ 이름은 겹쳐도 된다.
      AbstractUser 의 username 은 기본적으로 unique 다. 로그인 ID 로 쓸 때는
      맞는 설계지만, 우리는 USERNAME_FIELD 가 email 이고 이 값은 화면에서
      "○○님, 어서 오세요" 로 부르는 호칭일 뿐이다.

      unique 인 채로 두면 지훈이라는 사람 둘 중 한 명은
      "해당 사용자 이름은 이미 존재합니다" 를 보고 가입을 포기한다.
      이름이 겹친다고 가입을 막는 서비스는 없다.
    """
    username = models.CharField(max_length=150, unique=False)

    #: 필수. 유효성 검사는 serializer 한 곳에서만 한다 (아래 주석 참조).
    mbti = models.CharField(max_length=4, null=False, blank=False)

    """
    ★ choices 를 모델에 두지 않는 이유
      serializer 가 "infp" 같은 소문자 입력을 대문자로 바꿔 준다.
      모델에도 choices 를 두면 그 변환이 일어나기 전에 모델 검증이
      걸려, 사용자가 맞게 적었는데도 거부되는 상황이 생긴다.
      판정하는 곳은 users/serializers.py 의 VALID_MBTI 하나다.
    """

    # 이메일 기반 로그인
    USERNAME_FIELD = "email"

    # createsuperuser 실행 시 함께 입력받을 필드
    REQUIRED_FIELDS = ["username", "mbti"]

    def __str__(self):
        return self.email
