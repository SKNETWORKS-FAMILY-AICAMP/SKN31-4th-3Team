"""
users/management/commands/dbcheck.py
────────────────────────────────────────────────────────────────────────
DB 에 무엇이 들어 있는지 한 번에 본다.

★ Swagger 는 DB 를 보여 주지 않는다.
  Swagger 는 "어떤 API 가 있는가"를 보여 주는 문서다. 가입이 실제로
  저장됐는지 확인하려면 DB 를 봐야 한다.

사용:
    python manage.py dbcheck          # 요약
    python manage.py dbcheck --full   # 회원·대화 목록까지
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from chat.models import ChatMessage, ChatSession
from scripture.models import Galaxy, Verse

User = get_user_model()


class Command(BaseCommand):
    help = 'DB 적재 상태를 확인한다'

    def add_arguments(self, parser):
        parser.add_argument('--full', action='store_true', help='목록까지 출력')

    def handle(self, *args, **options):
        from django.db import connection

        self.stdout.write(f'\n연결된 DB   {connection.settings_dict["ENGINE"].split(".")[-1]}'
                          f'  ·  {connection.settings_dict["NAME"]}')
        self.stdout.write('─' * 60)

        rows = [
            ('회원', User.objects.count()),
            ('대화방', ChatSession.objects.count()),
            ('메시지', ChatMessage.objects.count()),
            ('은하', Galaxy.objects.count()),
            ('구절', Verse.objects.count()),
        ]
        for label, count in rows:
            self.stdout.write(f'  {label:8} {count:>6}')

        if Galaxy.objects.count() == 0:
            self.stdout.write(self.style.WARNING(
                '\n  ⚠ 은하·구절이 비어 있습니다 → python manage.py seed_scripture'))

        if not options['full']:
            self.stdout.write('\n(--full 로 목록까지 볼 수 있습니다)\n')
            return

        self.stdout.write('\n── 회원 ' + '─' * 52)
        for u in User.objects.order_by('-date_joined')[:20]:
            joined = u.date_joined.strftime('%m-%d %H:%M')
            self.stdout.write(f'  {joined}  {u.email:32} {u.username:10} {u.mbti}')

        self.stdout.write('\n── 대화방 ' + '─' * 50)
        for s in ChatSession.objects.select_related('user').order_by('-updated_at')[:20]:
            n = s.messages.count()
            self.stdout.write(f'  #{s.id:<4} {s.user.email:28} 메시지 {n:>3}개  {s.title[:24]}')

        self.stdout.write('\n── 최근 메시지 ' + '─' * 45)
        for m in ChatMessage.objects.select_related('session').order_by('-created_at')[:10]:
            body = m.content.replace('\n', ' ')[:52]
            self.stdout.write(f'  #{m.session_id:<4} {m.role:9} {body}')
        self.stdout.write('')
