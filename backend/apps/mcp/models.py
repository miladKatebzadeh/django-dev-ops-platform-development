from django.db import models

class MCPTool(models.Model):
    STATUS_CHOICES = [('draft','Draft'),('active','Active'),('disabled','Disabled'),('archived','Archived')]
    name = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    code = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class MCPToolVersion(models.Model):
    tool = models.ForeignKey(MCPTool, related_name='versions', on_delete=models.CASCADE)
    version = models.PositiveIntegerField()
    description = models.TextField(blank=True)
    code = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['tool','version'], name='unique_tool_version')]
