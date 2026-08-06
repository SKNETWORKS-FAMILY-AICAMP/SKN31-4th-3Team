"""
회원정보 수정과 탈퇴.

★ 여기서 잡아야 하는 고장
  - 남의 계정을 지울 수 있음
  - 탈퇴했는데 대화방이 서버에 남음
  - PATCH 가 200 을 돌려주는데 값은 안 바뀜 (읽기 전용 직렬화기를 쓴 경우)
  - 공백 이름이 저장되어 화면의 "○○님" 이 "님" 이 됨
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from chat.models import ChatMessage, ChatSession

User = get_user_model()

ME = "/api/v1/auth/me/"


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="a@b.c", username="혁진", password="pw-12345678", mbti="INFP"
    )


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.fixture
def thread(user):
    """대화방 하나와 그 안의 메시지 하나."""
    session = ChatSession.objects.create(user=user, title="지난 이야기")
    ChatMessage.objects.create(session=session, role="user", content="안녕하세요")
    return session


class TestUpdate:
    def test_reads_me(self, client):
        res = client.get(ME)
        assert res.status_code == 200
        assert res.data["username"] == "혁진"
        assert res.data["mbti"] == "INFP"

    def test_changes_name_and_mbti(self, client, user):
        """
        ★ 실제로 저장돼야 한다.
          읽기 전용 직렬화기를 PATCH 에 쓰면 200 이 오는데 값은 그대로다.
          화면에서는 저장된 것처럼 보이고 새로고침하면 되돌아간다 —
          가장 찾기 어려운 종류의 버그다.
        """
        res = client.patch(ME, {"username": "혁진2", "mbti": "entp"}, format="json")
        assert res.status_code == 200

        user.refresh_from_db()
        assert user.username == "혁진2"
        # 소문자로 적어도 받아 준다
        assert user.mbti == "ENTP"

    def test_rejects_blank_name(self, client, user):
        # "   " 는 required 검사를 통과한다. 여기서 막지 않으면 그대로 저장된다.
        res = client.patch(ME, {"username": "   "}, format="json")
        assert res.status_code == 400

        user.refresh_from_db()
        assert user.username == "혁진"

    def test_rejects_unknown_mbti(self, client):
        assert client.patch(ME, {"mbti": "XXXX"}, format="json").status_code == 400

    def test_email_is_not_editable(self, client, user):
        """
        ★ 이메일은 로그인 아이디다.
          바꾸려면 본인 확인이 따라붙어야 하고, 그것은 별도의 일이다.
          지금은 조용히 무시된다 — 400 이 아니라 "안 바뀐다" 가 맞다.
        """
        client.patch(ME, {"email": "hacker@evil.com"}, format="json")
        user.refresh_from_db()
        assert user.email == "a@b.c"

    def test_anonymous_cannot_read(self):
        assert APIClient().get(ME).status_code == 401


class TestWithdraw:
    def test_deletes_the_account(self, client, user):
        res = client.delete(ME)
        assert res.status_code == 204
        assert not User.objects.filter(pk=user.pk).exists()

    def test_deletes_conversations_too(self, client, user, thread):
        """
        ★ 대화가 함께 사라져야 한다.
          "탈퇴했는데 서버에 대화가 남아 있다" 는 설명할 수 없다.
          ChatSession 이 user 에 CASCADE 로 걸려 있어 함께 지워진다 —
          이 테스트가 그 연결을 지킨다.
        """
        assert ChatSession.objects.filter(user=user).exists()

        client.delete(ME)

        assert not ChatSession.objects.filter(pk=thread.pk).exists()
        assert not ChatMessage.objects.filter(session_id=thread.pk).exists()

    def test_only_deletes_my_own(self, client, user, db):
        """★ 남의 계정과 대화는 건드리지 않는다."""
        other = User.objects.create_user(
            email="x@y.z", username="다른사람", password="pw-12345678", mbti="ISTJ"
        )
        other_session = ChatSession.objects.create(user=other, title="남의 대화")

        client.delete(ME)

        assert User.objects.filter(pk=other.pk).exists()
        assert ChatSession.objects.filter(pk=other_session.pk).exists()

    def test_anonymous_cannot_delete(self, user):
        assert APIClient().delete(ME).status_code == 401
        assert User.objects.filter(pk=user.pk).exists()


SESSIONS = "/api/v1/chat/sessions/"


class TestSessionList:
    """
    사이드바가 읽는 목록.

    ★ 여기서 잡아야 하는 고장
      - 열기만 하고 나간 빈 방이 목록에 쌓임
      - 순서가 DB 마음이라 최근 대화가 맨 아래에 뜸
      - 미리보기가 없어 "새로운 대화" 여럿을 구분할 수 없음
      - 남의 대화가 보임

    ★ 응답은 페이지네이션된 모양이다 ({count, results}).
      화면 쪽(ThreadsContext)도 두 모양을 다 받도록 해 두었다 —
      설정이 바뀌어도 목록이 통째로 비지 않게 하려는 것이다.
    """

    @staticmethod
    def rows(res):
        data = res.data
        return data["results"] if isinstance(data, dict) else data

    def test_hides_empty_rooms(self, client, user):
        """
        ★ 대화방은 상담 화면에 들어서는 순간 만들어진다.
          아무 말도 안 하고 나가면 "새로운 대화" 가 하나 남는다. 그런 것이
          쌓이면 사이드바가 빈 방 목록이 된다.
        """
        ChatSession.objects.create(user=user, title="열기만 한 방")
        spoken = ChatSession.objects.create(user=user, title="말을 건 방")
        ChatMessage.objects.create(session=spoken, role="user", content="안녕하세요")

        res = client.get(SESSIONS)
        assert res.status_code == 200
        titles = [row["title"] for row in self.rows(res)]
        assert titles == ["말을 건 방"]

    def test_newest_first(self, client, user):
        """order_by 가 없으면 순서가 DB 마음이다."""
        for name in ("첫째", "둘째", "셋째"):
            session = ChatSession.objects.create(user=user, title=name)
            ChatMessage.objects.create(session=session, role="user", content="말")
            # updated_at 은 auto_now 라 저장할 때마다 갱신된다
            session.save()

        titles = [row["title"] for row in self.rows(client.get(SESSIONS))]
        assert titles == ["셋째", "둘째", "첫째"]

    def test_carries_last_message(self, client, user, thread):
        """
        ★ 제목만 있으면 "새로운 대화" 가 여럿일 때 구분할 수 없다.
          마지막 말이 그 대화를 가장 잘 가리킨다.
        """
        ChatMessage.objects.create(session=thread, role="assistant", content="언제부터요")

        row = self.rows(client.get(SESSIONS))[0]
        assert row["last_message"] == "언제부터요"

    def test_does_not_leak_others(self, client, db):
        other = User.objects.create_user(
            email="x@y.z", username="다른사람", password="pw-12345678", mbti="ISTJ"
        )
        session = ChatSession.objects.create(user=other, title="남의 대화")
        ChatMessage.objects.create(session=session, role="user", content="비밀")

        assert self.rows(client.get(SESSIONS)) == []


class TestResume:
    """지난 대화 이어 보기 — 상세에 메시지가 함께 온다."""

    def test_returns_messages_in_order(self, client, thread):
        ChatMessage.objects.create(session=thread, role="assistant", content="언제부터요")

        res = client.get(f"{SESSIONS}{thread.pk}/")
        assert res.status_code == 200
        assert [m["content"] for m in res.data["messages"]] == ["안녕하세요", "언제부터요"]

    def test_carries_persona(self, client, user):
        """
        ★ 그때 그 인물이 그대로여야 한다.
          다시 계산하면 데이터가 늘었을 때 다른 사람이 나온다.
        """
        session = ChatSession.objects.create(
            user=user, title="지난 이야기", persona_id="peter", persona_reason="무너져 본 사람"
        )
        ChatMessage.objects.create(session=session, role="user", content="말")

        res = client.get(f"{SESSIONS}{session.pk}/")
        assert res.data["persona_id"] == "peter"
        assert res.data["persona_reason"] == "무너져 본 사람"
        # 첫 인사도 함께 온다 — 화면이 맨 앞에 다시 얹는다
        assert res.data["opening"]

    def test_cannot_read_others(self, client, db):
        other = User.objects.create_user(
            email="x@y.z", username="다른사람", password="pw-12345678", mbti="ISTJ"
        )
        session = ChatSession.objects.create(user=other, title="남의 대화")
        assert client.get(f"{SESSIONS}{session.pk}/").status_code == 404

    def test_deletes_own_room(self, client, thread):
        assert client.delete(f"{SESSIONS}{thread.pk}/").status_code == 204
        assert not ChatSession.objects.filter(pk=thread.pk).exists()


REFRESH = "/api/v1/auth/refresh/"


class TestTokenRefresh:
    """
    ★ 실제로 났던 고장이다.
      SQLite 에서 Postgres 로 옮긴 뒤, 브라우저에 남아 있던 refresh 토큰이
      새 DB 에 없는 user_id 를 가리켰다. SimpleJWT 가 User.DoesNotExist 를
      그대로 올려 500 이 났다. 서버가 고장 난 게 아니라 토큰이 못 쓰는
      것이므로 401 이 맞다.

    ★ 탈퇴를 만든 이상 이 경로는 반드시 지나간다.
      계정을 지운 사용자의 브라우저에도 같은 토큰이 남아 있다.
    """

    def test_refreshes_for_a_live_user(self, client, user):
        from rest_framework_simplejwt.tokens import RefreshToken

        token = RefreshToken.for_user(user)
        res = APIClient().post(REFRESH, {"refresh": str(token)}, format="json")
        assert res.status_code == 200
        assert res.data["access"]

    def test_deleted_user_gets_401_not_500(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken

        token = str(RefreshToken.for_user(user))
        user.delete()

        res = APIClient().post(REFRESH, {"refresh": token}, format="json")
        assert res.status_code == 401, f"500 이 나면 화면이 재시도를 반복한다 (실제: {res.status_code})"

    def test_garbage_token_gets_401(self):
        res = APIClient().post(REFRESH, {"refresh": "not-a-token"}, format="json")
        assert res.status_code == 401
