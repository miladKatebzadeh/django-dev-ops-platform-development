from rest_framework import viewsets
from .models import AuditEvent
from .serializers import AuditEventSerializer
class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditEventSerializer
    queryset = AuditEvent.objects.all()
