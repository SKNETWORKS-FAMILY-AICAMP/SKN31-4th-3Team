"""
tests/test_integration.py
────────────────────────────────────────────────────────────────────────
프런트가 부르는 순서 그대로 확인한다.

★ 여기서 지키는 것은 "계약"이다.
  필드 이름 하나가 바뀌면 화면이 조용히 빈칸이 된다. 응답 키를 직접
  단언해 두면 그런 변경이 배포 전에 걸린다.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from scripture.models import Galaxy, Verse

User = get_user_model()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def seeded(db):
    from django.core.management import call_command

    call_command("seed_scripture")


@pytest.fixture
def auth(client, db):
    client.post(
        "/api/v1/auth/register/",
        {"email": "a@b.com", "username": "t", "password": "pw12345678", "mbti": "INFJ"},
        format="json",
    )
    token = client.post(
        "/api/v1/auth/login/",
        {"email": "a@b.com", "password": "pw12345678"},
        format="json",
    ).data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


class TestOpenEndpoints:
    """로그인 없이 열려야 하는 것 — 둘러보기까지는 벽이 없어야 한다."""

    def test_healthz(self, client):
        assert client.get("/healthz/").status_code == 200

    def test_galaxies(self, client, seeded):
        response = client.get("/api/v1/scripture/galaxies/")
        assert response.status_code == 200
        assert len(response.data) == 13
        assert {"id", "name", "role", "mbti", "tint", "is_center", "order"} <= set(
            response.data[0]
        )

    def test_verses_not_paginated(self, client, seeded):
        """★ 페이지를 나누면 은하가 조각조각 나타난다."""
        response = client.get("/api/v1/scripture/verses/")
        assert response.status_code == 200
        assert isinstance(response.data, list)
        assert len(response.data) == Verse.objects.count()

    def test_verse_detail_uses_slug(self, client, seeded):
        response = client.get("/api/v1/scripture/verses/gen-1-3/")
        assert response.status_code == 200
        assert response.data["book_name"] == "창세기"
        assert response.data["depth"] == "full"

    def test_brief_verse_has_no_quote(self, client, seeded):
        """★ 저작권을 확인할 수 없는 인용을 싣지 않는다는 원칙."""
        brief = Verse.objects.filter(depth="brief").first()
        response = client.get(f"/api/v1/scripture/verses/{brief.id}/")
        assert response.data["excerpt"] == ""
        assert response.data["summary"]

    def test_ask_contract(self, client, seeded):
        response = client.post(
            "/api/v1/scripture/ask/",
            {"question": "요즘 너무 불안해요", "attempt": 0},
            format="json",
        )
        assert response.status_code == 200
        assert set(response.data) == {
            "question",
            "intent",
            "empathy",
            "reflection",
            "verse_ids",
            "follow_ups",
        }
        assert response.data["intent"] == "anxiety"

    def test_ask_attempt_rotates(self, client, seeded):
        """★ '다른 구절 보기'가 실제로 다른 구절을 준다."""
        body = {"question": "요즘 너무 불안해요"}
        first = client.post("/api/v1/scripture/ask/", {**body, "attempt": 0}, format="json")
        second = client.post("/api/v1/scripture/ask/", {**body, "attempt": 1}, format="json")
        assert first.data["verse_ids"] != second.data["verse_ids"]

    def test_ask_is_deterministic(self, client, seeded):
        """새로고침해도 같은 결과여야 공유가 깨지지 않는다."""
        body = {"question": "진로가 고민이에요", "attempt": 0}
        a = client.post("/api/v1/scripture/ask/", body, format="json")
        b = client.post("/api/v1/scripture/ask/", body, format="json")
        assert a.data == b.data

    def test_ask_recommends_existing_verses(self, client, seeded):
        """추천이 실재하지 않는 구절을 가리키면 화면이 빈칸이 된다."""
        response = client.post(
            "/api/v1/scripture/ask/", {"question": "외로워요"}, format="json"
        )
        for verse_id in response.data["verse_ids"]:
            assert Verse.objects.filter(id=verse_id).exists(), verse_id


class TestAuthWall:
    """대화는 사용자의 기록이다."""

    def test_sessions_require_login(self, client, db):
        assert client.get("/api/v1/chat/sessions/").status_code == 401

    def test_stream_requires_login(self, client, db):
        assert client.post("/api/v1/chat/sessions/1/stream/", {}, format="json").status_code == 401

    def test_cannot_read_others_thread(self, auth, seeded, db):
        thread = auth.post("/api/v1/chat/sessions/", {"title": "내 대화"}, format="json").data["id"]

        other = APIClient()
        other.post(
            "/api/v1/auth/register/",
            {"email": "x@y.com", "username": "o", "password": "pw12345678", "mbti": "INFP"},
            format="json",
        )
        token = other.post(
            "/api/v1/auth/login/", {"email": "x@y.com", "password": "pw12345678"}, format="json"
        ).data["access"]
        other.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # ★ 번호를 바꿔 가며 남의 대화를 읽을 수 없어야 한다.
        assert other.get(f"/api/v1/chat/sessions/{thread}/messages/").status_code == 403


class TestCounselFlow:
    """
    대화 시작은 "빈 방을 만드는 일" 이다.

    예전에는 /chat/threads/ 가 방 생성과 첫 인사를 함께 돌려줬다. 지금은
    방만 만들고 첫 인사는 화면이 만든다 — 인사를 서버에서 받으려면 LLM 을
    한 번 더 불러야 하고, 그 시간만큼 사용자는 빈 화면을 본다.
    """

    def test_start_session(self, auth, seeded, db):
        response = auth.post(
            "/api/v1/chat/sessions/", {"title": "요즘 잠이 안 와요"}, format="json"
        )
        assert response.status_code == 201
        assert response.data["title"] == "요즘 잠이 안 와요"
        assert isinstance(response.data["id"], int)

    def test_new_session_starts_empty(self, auth, seeded, db):
        """방을 만들었다고 메시지가 생기지는 않는다."""
        sid = auth.post("/api/v1/chat/sessions/", {}, format="json").data["id"]
        body = auth.get(f"/api/v1/chat/sessions/{sid}/messages/").data
        assert body["results"] == []

    def test_stream_accepts_event_stream_header(self, auth, seeded, db):
        """
        ★ 브라우저는 SSE 규격대로 Accept: text/event-stream 을 보낸다.

        DRF 는 핸들러를 부르기 전에 Accept 로 렌더러를 고르고, 맞는 것이
        없으면 406 으로 막는다. 실제로 이것 때문에 화면에서만 대화가
        실패했다 — 헤더 없이 부르는 테스트로는 잡히지 않는다.
        """
        sid = auth.post("/api/v1/chat/sessions/", {}, format="json").data["id"]
        response = auth.post(
            f"/api/v1/chat/sessions/{sid}/stream/",
            {"message": "안녕하세요"},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert response.status_code == 200
        assert response.headers["Content-Type"].startswith("text/event-stream")

    def test_stream_records_user_message(self, auth, seeded, db):
        """
        LLM 이 실패해도 사용자가 한 말은 남는다.

        (이 환경에는 OPENAI_API_KEY 가 없으므로 답변 쪽은 오류로 끝난다 —
         그래도 서버가 죽지 않고 오류를 스트림으로 흘리는지까지 본다)
        """
        sid = auth.post("/api/v1/chat/sessions/", {}, format="json").data["id"]
        response = auth.post(
            f"/api/v1/chat/sessions/{sid}/stream/",
            {"message": "요즘 외로워요"},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        body = b"".join(response.streaming_content).decode("utf-8")
        assert body.startswith("data: ")

        messages = auth.get(f"/api/v1/chat/sessions/{sid}/messages/").data["results"]
        assert [m["role"] for m in messages] == ["user"]
        assert messages[0]["content"] == "요즘 외로워요"


class TestUserProfile:
    def test_register_accepts_mbti(self, client, db):
        response = client.post(
            "/api/v1/auth/register/",
            {"email": "m@b.com", "username": "m", "password": "pw12345678", "mbti": "ENFP"},
            format="json",
        )
        assert response.status_code == 201
        assert User.objects.get(email="m@b.com").mbti == "ENFP"

    def test_mbti_is_required(self, client, db):
        """
        ★ 선택에서 필수로 바뀌었다.

        비워 두면 오른쪽 목록에서 아무것도 빛나지 않아 사용자는
        "왜 나만 안 되지" 를 묻게 된다. 프론트도 가입 폼에서 막는다.
        """
        response = client.post(
            "/api/v1/auth/register/",
            {"email": "n@b.com", "username": "n", "password": "pw12345678"},
            format="json",
        )
        assert response.status_code == 400
        assert "mbti" in response.data

    def test_mbti_accepts_lowercase(self, client, db):
        """소문자로 적어도 통과하고 대문자로 저장된다."""
        response = client.post(
            "/api/v1/auth/register/",
            {"email": "low@b.com", "username": "l", "password": "pw12345678", "mbti": "infp"},
            format="json",
        )
        assert response.status_code == 201
        assert User.objects.get(email="low@b.com").mbti == "INFP"

    def test_mbti_rejects_unknown_type(self, client, db):
        response = client.post(
            "/api/v1/auth/register/",
            {"email": "bad@b.com", "username": "b", "password": "pw12345678", "mbti": "XXXX"},
            format="json",
        )
        assert response.status_code == 400

    def test_username_may_repeat(self, client, db):
        """
        ★ 이름이 겹친다고 가입을 막지 않는다.

        username 은 로그인 ID 가 아니라 "○○님" 으로 부르는 호칭이다.
        지훈이라는 사람 둘 중 한 명이 가입을 포기하게 되면 안 된다.
        """
        for i in (1, 2):
            response = client.post(
                "/api/v1/auth/register/",
                {
                    "email": f"same{i}@b.com",
                    "username": "지훈",
                    "password": "pw12345678",
                    "mbti": "INFP",
                },
                format="json",
            )
            assert response.status_code == 201

    def test_can_update_mbti(self, auth, db):
        response = auth.patch("/api/v1/auth/me/", {"mbti": "ISTJ"}, format="json")
        assert response.status_code == 200
        assert auth.get("/api/v1/auth/me/").data["mbti"] == "ISTJ"


class TestSeed:
    def test_seed_is_idempotent(self, seeded, db):
        """배포마다 돌려도 안전해야 한다."""
        from django.core.management import call_command

        before = (Galaxy.objects.count(), Verse.objects.count())
        call_command("seed_scripture")
        assert (Galaxy.objects.count(), Verse.objects.count()) == before

    def test_every_verse_belongs_to_a_galaxy(self, seeded, db):
        assert Verse.objects.filter(galaxy__isnull=True).count() == 0

    def test_curated_count(self, seeded, db):
        assert Verse.objects.filter(depth="full").count() == 40
