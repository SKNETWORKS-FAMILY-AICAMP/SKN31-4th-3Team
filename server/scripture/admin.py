"""scripture/admin.py — 은하와 구절을 관리자 화면에서 확인한다."""

from django.contrib import admin

from .models import Galaxy, Verse


@admin.register(Galaxy)
class GalaxyAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'role', 'mbti', 'is_center', 'order')
    list_filter = ('is_center', 'mbti')
    ordering = ('order',)


@admin.register(Verse)
class VerseAdmin(admin.ModelAdmin):
    list_display = ('id', 'galaxy', 'reference', 'depth', 'summary')
    list_filter = ('depth', 'galaxy')
    search_fields = ('id', 'summary', 'excerpt')
    ordering = ('galaxy', 'order')

    @admin.display(description='장·절')
    def reference(self, obj):
        return f'{obj.book_name} {obj.chapter}:{obj.verse}'
