from rest_framework import serializers
from .models import MCPTool, MCPToolVersion

class MCPToolVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MCPToolVersion
        fields = '__all__'

class MCPToolSerializer(serializers.ModelSerializer):
    versions = MCPToolVersionSerializer(many=True, read_only=True)
    class Meta:
        model = MCPTool
        fields = ['id','name','description','code','status','archived_at','created_at','updated_at','versions']
