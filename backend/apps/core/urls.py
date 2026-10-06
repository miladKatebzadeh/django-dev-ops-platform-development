from django.urls import path
from .views import health, infrastructure_telemetry

urlpatterns = [
    path('health/', health, name='health'),
    path('infrastructure/telemetry/', infrastructure_telemetry, name='infrastructure_telemetry'),
]
