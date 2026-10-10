import uuid
import ollama
from django.utils import timezone
from django.db import connection
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, decorators, response, status

from .models import MCPTool, MCPToolVersion
from .serializers import MCPToolSerializer
from apps.audit.models import AuditEvent

# Safe fallback import for ChromaDB Vector Database
try:
    from apps.knowledge.views import chroma_collection
except ImportError:
    chroma_collection = None


class MCPToolViewSet(viewsets.ModelViewSet):
    serializer_class = MCPToolSerializer
    
    def get_queryset(self):
        queryset = MCPTool.objects.all().order_by('-updated_at')
        if self.request.query_params.get('include_archived') != 'true':
            queryset = queryset.filter(archived_at__isnull=True)
        return queryset

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        if not data.get('status'):
            data['status'] = 'active'
            
        if data.get('name'):
            data['name'] = data['name'].strip().replace(' ', '_')

        serializer = self.get_serializer(data=data)
        if not serializer.is_valid():
            print(f"⚠️ MCP Serializer error intercepted: {serializer.errors}")
            return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return response.Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        tool = serializer.save()
        try:
            MCPToolVersion.objects.create(
                tool=tool, 
                version=1, 
                description=tool.description or 'Initial live runbook tool blueprint', 
                code=tool.code or ''
            )
        except Exception as e:
            print(f"⚠️ Versioning table bypass note: {e}")

        try:
            AuditEvent.objects.create(action='create', resource_type='mcp_tool', resource_id=str(tool.pk), payload={'name': tool.name})
        except Exception:
            pass

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', True)
        instance = self.get_object()
        
        data = request.data.copy()
        if data.get('name'):
            data['name'] = data['name'].strip().replace(' ', '_')

        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return response.Response(serializer.data)

    def perform_update(self, serializer):
        tool = serializer.save()
        try:
            last_version_obj = tool.versions.order_by('-version').first()
            next_version = (last_version_obj.version if last_version_obj else 0) + 1
            
            MCPToolVersion.objects.create(
                tool=tool, 
                version=next_version, 
                description=tool.description, 
                code=tool.code
            )
        except Exception as e:
            next_version = 1
            print(f"⚠️ Version control insert statement skipped: {e}")

        try:
            AuditEvent.objects.create(action='update', resource_type='mcp_tool', resource_id=str(tool.pk), payload={'version': next_version})
        except Exception:
            pass

    def destroy(self, request, *args, **kwargs):
        tool = self.get_object()
        if request.query_params.get('confirm') != 'true':
            return response.Response({'detail': 'Deletion requires confirm=true.'}, status=status.HTTP_400_BAD_REQUEST)
        
        tool.archived_at = timezone.now()
        tool.status = 'archived'
        tool.save(update_fields=['archived_at', 'status', 'updated_at'])
        
        try:
            AuditEvent.objects.create(action='delete', resource_type='mcp_tool', resource_id=str(tool.pk), payload={'mode': 'soft_delete'})
        except Exception:
            pass
        return response.Response(status=status.HTTP_204_NO_CONTENT)


@csrf_exempt
@decorators.api_view(['POST'])
def mcp_ai_chat(request):
    """
    Intelligent RAG & Telemetry AI Chat console checking for live models.
    Safely flattens nested arrays from ChromaDB to prevent TypeErrors.
    """
    user_message = request.data.get('message', '').strip()
    if not user_message:
        return response.Response({'detail': 'Message payload cannot be empty.'}, status=400)

    ollama_host = "http://localhost:11434"
    target_model = "qwen2.5-coder:7b"
    
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT key, value FROM mcp_systemsetting WHERE key IN ('ollama_host', 'ollama_model');")
            settings_dict = dict(cursor.fetchall())
            if 'ollama_host' in settings_dict:
                ollama_host = settings_dict['ollama_host']
            if 'ollama_model' in settings_dict:
                target_model = settings_dict['ollama_model']
    except Exception:
        pass

    context_documents = []
    if chroma_collection:
        try:
            search_results = chroma_collection.query(query_texts=[user_message], n_results=2)
            # 🌟 FIX: Safely pull out and flatten the inner array of strings from ChromaDB's nesting
            raw_documents = search_results.get('documents', [])
            if raw_documents and isinstance(raw_documents[0], list):
                context_documents = raw_documents[0]  # Extracts the array of real string documents
            elif raw_documents:
                context_documents = raw_documents
        except Exception as e:
            print(f"⚠️ ChromaDB skip: {e}")

    system_telemetry_snapshot = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT DISTINCT ON (container_name) container_name, status FROM docker_metrics ORDER BY container_name, id DESC;")
            system_telemetry_snapshot += "Live Containers Status:\n" + "\n".join([f"- {c[0]}: {c[1]}" for c in cursor.fetchall()]) + "\n"

            cursor.execute("SELECT DISTINCT ON (metric_name) metric_name, value FROM prometheus_alerts ORDER BY metric_name, id DESC LIMIT 5;")
            system_telemetry_snapshot += "\nLive System Metrics:\n" + "\n".join([f"- {m[0]}: {m[1]}" for m in cursor.fetchall()])
    except Exception:
        system_telemetry_snapshot = "Telemetry snapshot temporarily unavailable."

    # 🌟 SAFE JOIN: Because context_documents is now guaranteed to be a flat list of strings
    rag_context = "\n".join(context_documents) if context_documents else "No explicit runbooks found for this issue."
    
    system_prompt = f"""
You are OpsHub AI, an elite Agentic DevOps Engineering Copilot analyzing infrastructure failures.
[LIVE INFRASTRUCTURE TELEMETRY SNAPSHOT]
{system_telemetry_snapshot}
[RETRIEVED KNOWLEDGE BASE RUNBOOKS (RAG)]
{rag_context}
1. Use the snapshot and runbooks to diagnose the user's issue.
2. Provide short, punchy, actionable solutions. Do not hallucinate data.
"""

    try:
        client = ollama.Client(host=ollama_host)
        
        # Safe checkpoint to inform the frontend if your specific laptop model weight isn't loaded
        try:
            local_models = client.list().get('models', [])
            model_names = [m.get('model') for m in local_models]
            if target_model not in model_names and f"{target_model}:latest" not in model_names:
                return response.Response({
                    'reply': f"🤖 **System Status:** Connected to Ollama node at `{ollama_host}`, but model weights for `{target_model}` are missing. Please pull it on your laptop using `ollama pull {target_model}` to activate full execution.",
                    'sources': context_documents
                }, status=200)
        except Exception:
            pass

        ollama_response = client.chat(
            model=target_model, 
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message}
            ]
        )
        return response.Response({'reply': ollama_response['message']['content'], 'sources': context_documents}, status=200)
    except Exception as e:
        return response.Response({
            'reply': f"🤖 OpsHub AI Engine: Managed to parse telemetry structures, but the Ollama node at '{ollama_host}' is unreachable. Verify your laptop background server status. Diagnostic: {str(e)}", 
            'sources': context_documents
        }, status=200)


@csrf_exempt
@decorators.api_view(['POST'])
def save_system_settings(request):
    """
    Saves and updates configuration fields dynamically.
    Accepts partial updates without returning an HTTP 400.
    """
    # 🌟 Instead of strict matching, we iterate over whatever keys the frontend sends
    if not request.data:
        return response.Response({'detail': 'No configuration payload provided.'}, status=400)

    try:
        with connection.cursor() as cursor:
            # Create table if it doesn't exist
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mcp_systemsetting (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) UNIQUE NOT NULL,
                    value TEXT NOT NULL
                );
            """)
            
            # Loop through keys (ollama_host, ollama_model, prometheus_url, etc.)
            for key, value in request.data.items():
                clean_value = str(value).strip()
                if clean_value:
                    cursor.execute("""
                        INSERT INTO mcp_systemsetting (key, value) VALUES (%s, %s)
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
                    """, (key, clean_value))
            
        return response.Response({'status': 'success', 'message': 'Cluster configurations saved.'}, status=200)
    except Exception as e:
        return response.Response({'detail': f'Database pipeline failed: {str(e)}'}, status=500)


@csrf_exempt
@decorators.api_view(['GET'])
def list_local_ollama_models(request):
    """
    Fetches available local models for the frontend config dropdown.
    """
    ollama_host = "http://localhost:11434"
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT value FROM mcp_systemsetting WHERE key = 'ollama_host' LIMIT 1;")
            row = cursor.fetchone()
            if row:
                ollama_host = row[0]
    except Exception:
        pass

    try:
        client = ollama.Client(host=ollama_host)
        local_models = client.list().get('models', [])
        model_tags = [m.get('model') for m in local_models]
        return response.Response({'status': 'success', 'models': model_tags}, status=200)
    except Exception as e:
        return response.Response({'status': 'offline', 'models': [], 'message': str(e)}, status=200)
