"""
llm_core/negotiation.py
────────────────────────────────────────────────────────────────────────
SSE 엔드포인트를 위한 콘텐츠 협상.

★ 문제
  DRF 는 핸들러를 부르기 전에 Accept 헤더를 보고 응답 렌더러를 고른다.
  기본 렌더러는 JSON 뿐이라, 브라우저가 SSE 규격대로
  `Accept: text/event-stream` 을 보내면 **406 Not Acceptable** 로 막힌다.
  뷰의 post() 는 실행조차 되지 않는다.

  Accept 헤더 없이 부르면 통과하기 때문에, curl 이나 테스트 클라이언트로는
  멀쩡하고 브라우저에서만 실패한다. 실제로 그렇게 한참 헤맸다.

★ 해결
  이 엔드포인트는 DRF 렌더러를 쓰지 않는다 — StreamingHttpResponse 를
  직접 만들어 돌려준다. 그러니 협상 자체를 건너뛰면 된다.

★ 왜 Accept 헤더를 없애지 않았는가
  프론트에서 헤더를 빼면 당장은 통과한다. 하지만 그건 "규격대로 보내면
  깨지는 API" 를 남겨 두는 것이다. 다음 사람이 표준대로 짜면 또 막힌다.
"""

from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.renderers import BaseRenderer


class EventStreamRenderer(BaseRenderer):
    """
    형식만 갖춘 렌더러.

    실제로 렌더하지 않는다 — 뷰가 StreamingHttpResponse 를 직접 반환하므로
    이 render() 는 호출되지 않는다. drf-spectacular 가 스키마에
    text/event-stream 을 표시하게 하는 역할도 겸한다.
    """

    media_type = 'text/event-stream'
    format = 'txt'
    charset = 'utf-8'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class IgnoreClientContentNegotiation(BaseContentNegotiation):
    """Accept 헤더를 따지지 않고 첫 번째 렌더러를 쓴다."""

    def select_parser(self, request, parsers):
        return parsers[0]

    def select_renderer(self, request, renderers, format_suffix=None):
        return (renderers[0], renderers[0].media_type)
