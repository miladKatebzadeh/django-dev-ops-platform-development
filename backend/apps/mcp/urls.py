from rest_framework.routers import DefaultRouter
from .views import MCPToolViewSet
router = DefaultRouter()
router.register('tools', MCPToolViewSet, basename='mcp-tool')
urlpatterns = router.urls
