"""scripture/urls.py"""

from django.urls import path

from .views import AskView, GalaxyListView, VerseDetailView, VerseListView

urlpatterns = [
    path("galaxies/", GalaxyListView.as_view(), name="galaxy_list"),
    path("verses/", VerseListView.as_view(), name="verse_list"),
    path("verses/<str:pk>/", VerseDetailView.as_view(), name="verse_detail"),
    path("ask/", AskView.as_view(), name="verse_ask"),
]
