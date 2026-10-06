from django.urls import include, path
from apps.core.views import health

urlpatterns = [
    path('api/health/', health),
    path('api/', include('apps.core.urls')), 
    path('api/mcp/', include('apps.mcp.urls')),
    path('api/knowledge/', include('apps.knowledge.urls')),
    path('api/audit/', include('apps.audit.urls')),
]
