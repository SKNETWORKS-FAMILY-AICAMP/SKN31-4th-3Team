"""
tests/conftest.py
────────────────────────────────────────────────────────────────────────
모든 테스트에 공통으로 적용되는 준비.
"""

import pytest
from django.core.cache import cache


@pytest.fixture
def seeded(db):
    """
    13은하 · 큐레이션 702절.

    ★ conftest 에 있는 이유
      처음에는 test_integration.py 안에 있었다. 다른 파일에서 쓰려니
      "fixture 'seeded' not found" 가 났고, 그 메시지만 보고는 픽스처가
      어디 있는지 찾기가 번거롭다. 여러 파일이 쓰는 것은 여기 둔다.
    """
    from django.core.management import call_command

    call_command("seed_scripture")


@pytest.fixture(autouse=True)
def reset_throttle():
    """
    요청 횟수 기록을 테스트마다 지운다.

    ★ 왜 필요한가
      DRF 의 레이트 리밋(anon 60/분, user 120/분)은 캐시에 "이 IP 가
      최근 1분간 몇 번 불렀는가"를 쌓아 둔다. 테스트는 전부 같은 IP 로
      돌기 때문에, 테스트가 늘어나면 어느 순간 뒤쪽 테스트들이 429 를
      받기 시작한다.

    ★ 이게 고약한 이유
      실패하는 테스트가 "방금 고친 코드" 와 아무 상관이 없다. 테스트를
      추가했을 뿐인데 엉뚱한 파일의 테스트가 깨지고, 하나만 따로 돌리면
      또 통과한다. 원인을 짚기 전까지 시간을 크게 잡아먹는다.

    ★ 레이트 리밋 자체를 끄지는 않는다.
      끄면 "제한이 실제로 걸리는가"를 검사할 수 없게 된다. 여기서는
      테스트 사이의 기록만 지운다.
    """
    cache.clear()
    yield
    cache.clear()
