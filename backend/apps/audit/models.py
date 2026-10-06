from django.db import models

class AuditEvent(models.Model):
    actor = models.CharField(max_length=160, default='system')
    action = models.CharField(max_length=80)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=120, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    outcome = models.CharField(max_length=20, default='success')
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']
