from rest_framework import serializers
from .models import KnowledgeCollection, KnowledgeDocument

class KnowledgeDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeDocument
        fields = '__all__'

class KnowledgeCollectionSerializer(serializers.ModelSerializer):
    documents = KnowledgeDocumentSerializer(many=True, read_only=True)
    document_count = serializers.IntegerField(source='documents.count', read_only=True)
    class Meta:
        model = KnowledgeCollection
        fields = ['id','name','description','provider','archived_at','created_at','updated_at','documents','document_count']
