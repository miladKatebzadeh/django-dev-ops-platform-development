from django.urls import path
from .views import MCPToolViewSet, mcp_ai_chat, save_system_settings, list_local_ollama_models
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('tools', MCPToolViewSet, basename='mcp-tool')

urlpatterns = [
    path('chat/', mcp_ai_chat, name='mcp_ai_chat'),
    path('settings/', save_system_settings, name='save_system_settings'),
    path('settings/models/', list_local_ollama_models, name='list_local_ollama_models'),
] + router.urls
