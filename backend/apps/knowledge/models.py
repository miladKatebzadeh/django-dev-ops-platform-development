from django.db import models

class KnowledgeCollection(models.Model):
    name = models.SlugField(max_length=160, unique=True)
    description = models.TextField(blank=True)
    provider = models.CharField(max_length=40, default='chromadb')
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class KnowledgeDocument(models.Model):
    collection = models.ForeignKey(KnowledgeCollection, related_name='documents', on_delete=models.CASCADE)
    external_id = models.CharField(max_length=180)
    title = models.CharField(max_length=240)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['collection','external_id'], name='unique_collection_document')]
