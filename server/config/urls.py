"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request):
    """로드밸런서용 헬스체크. DB 를 건드리지 않는다."""
    return JsonResponse({'status': 'ok'})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('users.urls')),

    # Chat API
    path('api/v1/chat/', include('chat.urls')),

    # 말씀(은하·구절·추천) API
    path('api/v1/scripture/', include('scripture.urls')),

    # 헬스체크 — ALB/EC2 상태 확인이 DB 까지 건드리지 않도록 가볍게 둔다.
    path('healthz/', health, name='healthz'),

    # Swagger API 문서 관련 URL
    ## OpenAPI 스키마 파일 (YAML/JSON)
    path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    ## Swagger UI (위의 'schema' name을 참조하도록 수정한 부분)
    path('api/v1/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
