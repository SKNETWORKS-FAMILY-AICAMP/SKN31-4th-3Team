"""
성경전서 적재.

★ 여기서 잡아야 하는 고장
  - 다시 돌렸더니 3만 절이 6만 절이 됨
  - tone 이 전부 neutral — 적재는 성공했는데 안전장치만 조용히 빠짐
  - 정경 순서가 아니라 가나다순으로 정렬됨
  - 큐레이션 702절이 성경전서 적재에 휩쓸림
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command

from scripture.management.commands.ingest_bible import truncate
from scripture.models import BibleVerse, Verse

BIBLE = Path(__file__).resolve().parents[2] / "data" / "bible_structured.json"
pytestmark = pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")


def ingest(**kwargs) -> str:
    out = StringIO()
    call_command("ingest_bible", stdout=out, stderr=StringIO(), **kwargs)
    return out.getvalue()


class TestLoad:
    def test_loads_every_verse(self, db):
        ingest()
        assert BibleVerse.objects.count() == 31077

    def test_running_twice_does_not_duplicate(self, db):
        """★ 재실행이 안전해야 팀원이 마음 놓고 돌린다."""
        ingest()
        first = BibleVerse.objects.count()
        ingest()
        assert BibleVerse.objects.count() == first

    def test_content_is_intact(self, db):
        ingest(limit=200)
        assert BibleVerse.objects.get(id="창.1.1").content == "태초에 하나님이 천지를 창조하시니라"

    def test_reference_uses_full_book_name(self, db):
        ingest(limit=200)
        assert str(BibleVerse.objects.get(id="창.1.1")) == "창세기 1:1"


class TestOrder:
    def test_canonical_not_alphabetical(self, db):
        """
        ★ 가나다순이면 갈라디아서가 창세기보다 앞에 선다.
        """
        ingest()
        first = BibleVerse.objects.first()
        last = BibleVerse.objects.last()
        assert first.id == "창.1.1"
        assert last.id == "계.22.21"


class TestTone:
    def test_tone_is_stored_not_all_neutral(self, db):
        """
        ★ 전부 neutral 이면 구간표가 안 걸린 것이다.
          적재는 성공한 것처럼 보이고 안전장치만 빠진다 — 가장 조용한 실패다.
        """
        ingest()
        assert BibleVerse.objects.filter(tone="warning").count() > 0
        assert BibleVerse.objects.filter(tone="lament").count() > 0

    def test_the_verses_we_care_about(self, db):
        ingest()
        assert BibleVerse.objects.get(id="신.28.65").tone == "warning"
        assert BibleVerse.objects.get(id="욥.3.26").tone == "lament"
        assert BibleVerse.objects.get(id="요.3.16").tone == "neutral"

    def test_warning_stays_a_small_share(self, db):
        # 구간표를 넓게 잡으면 검색이 조용히 텅 빈다
        ingest()
        blocked = BibleVerse.objects.exclude(tone="neutral").count()
        assert blocked / BibleVerse.objects.count() < 0.02


class TestCurationIsUntouched:
    """
    ★ 큐레이션 702절과 성경전서는 다른 표다.
      한쪽 적재가 다른 쪽을 건드리면, 은하에 배정된 별이 사라진다.
    """

    def test_curated_verses_survive(self, db, seeded):
        before = Verse.objects.count()
        ingest()
        assert Verse.objects.count() == before

    def test_two_tables_do_not_collide(self, db, seeded):
        ingest()
        assert Verse.objects.count() == 702
        assert BibleVerse.objects.count() == 31077


class TestTruncate:
    """
    Matryoshka 절단. 4096차원을 1024로 줄여도 의미가 유지된다는 전제.
    """

    def test_keeps_the_front(self):
        assert truncate([1.0, 2.0, 3.0, 4.0], 2)[0] < truncate([1.0, 2.0, 3.0, 4.0], 2)[1]

    def test_result_is_unit_length(self):
        """
        ★ 다시 정규화하지 않으면 길이가 구절마다 달라진다.
          pgvector 의 <=> 와 HNSW 는 정규화된 벡터를 전제로 최적화돼 있다.
        """
        out = truncate([0.5] * 4096, 1024)
        assert len(out) == 1024
        assert sum(v * v for v in out) ** 0.5 == pytest.approx(1.0)

    def test_shorter_input_passes_through(self):
        assert truncate([1.0, 0.0], 1024) == [1.0, 0.0]

    def test_zero_vector_does_not_divide_by_zero(self):
        assert truncate([0.0] * 100, 10) == [0.0] * 10


class TestControlCharacters:
    """
    ★ 실제로 났던 고장이다.
      원본 JSON 의 세 절 끝에 NUL(0x00)이 붙어 있었다. SQLite 는 받아
      주고 Postgres 는 거부해서("A string literal cannot contain NUL"),
      DB 를 옮기는 순간 31,077절 적재가 통째로 실패했다.
    """

    def test_strips_nul(self):
        from scripture.management.commands.ingest_bible import _clean

        assert _clean("사랑의 입맞춤으로 문안하라\x00\x00\x00") == "사랑의 입맞춤으로 문안하라"

    def test_keeps_line_breaks(self):
        # 본문의 줄바꿈에는 의미가 있을 수 있다. 지우는 것은 제어문자뿐이다.
        from scripture.management.commands.ingest_bible import _clean

        assert _clean("첫 줄\n둘째 줄") == "첫 줄\n둘째 줄"

    def test_leaves_clean_text_alone(self):
        from scripture.management.commands.ingest_bible import _clean

        assert _clean("태초에 하나님이 천지를 창조하시니라") == "태초에 하나님이 천지를 창조하시니라"

    def test_source_file_has_no_control_characters_after_cleaning(self):
        """
        ★ 원본을 고치지 않고 적재에서 거른다.
          data/bible_structured.json 은 받아 온 자료다. 손대면 다시 받을 때
          같은 문제가 돌아온다. 거르는 쪽이 코드에 남아 있어야 한다.
        """
        import json
        from pathlib import Path

        from scripture.management.commands.ingest_bible import BIBLE, _clean

        if not Path(BIBLE).exists():
            pytest.skip("성경전서 파일이 없음")

        rows = json.loads(Path(BIBLE).read_text(encoding="utf-8"))
        for r in rows:
            cleaned = _clean(r["content"])
            assert "\x00" not in cleaned
            assert all(ch >= " " or ch in "\n\t" for ch in cleaned)


class TestEmbedLimit:
    """
    ★ 실제로 났던 고장이다.
      --limit 이 본문 적재만 잘랐다. "200절만 재 보자" 로 불렀는데
      31,077절 전체가 시작돼서, 시간을 재려던 사람이 87분짜리 작업을
      걸어 놓게 됐다.

    ★ 임베딩을 실제로 돌리지 않는다.
      Ollama 도 OpenAI 도 없이 도는 테스트여야 한다. 자를 대상을 고르는
      부분만 떼어 확인한다.
    """

    def test_limit_reaches_the_embed_step(self):
        import inspect

        from scripture.management.commands.ingest_bible import Command

        # handle 이 limit 을 _embed 로 넘기는가
        source = inspect.getsource(Command.handle)
        assert "limit=opts[\"limit\"]" in source

        # _embed 가 그 값을 받아 실제로 자르는가
        embed = inspect.getsource(Command._embed)
        assert "limit: int | None" in embed
        assert "pending = pending[:limit]" in embed

    def test_progress_is_reported_often_enough(self):
        """
        ★ 첫 줄이 5분 뒤에 뜨면 멈춘 것으로 보인다.
          DB_BATCH 와 같은 값을 쓰던 때 실제로 그랬다.
        """
        from scripture.management.commands.ingest_bible import DB_BATCH, EMBED_BATCH

        assert EMBED_BATCH < DB_BATCH
        # 초당 6절 기준으로 첫 줄이 1분 안에 떠야 한다
        assert EMBED_BATCH / 6 < 60
