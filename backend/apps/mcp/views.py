import os
import logging
import ollama
from django.utils import timezone
from django.db import connection
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, decorators, response, status

from .models import MCPTool, MCPToolVersion
from .serializers import MCPToolSerializer
from apps.audit.models import AuditEvent
from langfuse import Langfuse

logger = logging.getLogger(__name__)

# Configure credentials through environment variables; do not hard-code API keys.
langfuse_client = Langfuse(
    secret_key="sk-lf-46363ae9-619d-4818-af9f-05a79a75cb04",
    public_key="pk-lf-389113e5-db03-4ec0-9d42-dad8e0710afa",
    host="http://127.0.0.1:3030",
    debug=True,
)
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
@decorators.api_view(["POST"])
def mcp_ai_chat(request):
    import logging
    import ollama

    logger = logging.getLogger(__name__)

    user_message = (request.data.get("message") or "").strip()
    if not user_message:
        return response.Response(
            {"detail": "Message payload cannot be empty."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Read Ollama settings.
    ollama_host = "http://localhost:11434"
    target_model = "qwen2.5-coder:7b"

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT key, value FROM mcp_systemsetting "
                "WHERE key IN ('ollama_host', 'ollama_model');"
            )
            settings_dict = dict(cursor.fetchall())

        ollama_host = settings_dict.get("ollama_host", ollama_host)
        target_model = settings_dict.get("ollama_model", target_model)
    except Exception:
        logger.exception("Could not load Ollama settings")

    # Create the Langfuse v2 trace.
    trace_obj = None
    rag_span = None
    generation = None

    try:
        trace_obj = langfuse_client.trace(
            name="ai_diagnostics_console_lookup",
            input={"message": user_message},
        )
    except Exception:
        logger.exception("Langfuse trace creation failed")

    # Retrieve knowledge from ChromaDB.
    context_documents = []

    if trace_obj is not None:
        try:
            rag_span = trace_obj.span(
                name="chromadb_knowledge_retrieval",
                input={"query": user_message},
            )
        except Exception:
            logger.exception("Could not create retrieval span")

    try:
        if chroma_collection is not None:
            results = chroma_collection.query(
                query_texts=[user_message],
                n_results=2,
            )

            documents = results.get("documents") or []

            for group in documents:
                if isinstance(group, list):
                    context_documents.extend(
                        doc for doc in group
                        if isinstance(doc, str)
                    )
                elif isinstance(group, str):
                    context_documents.append(group)

        if rag_span is not None:
            rag_span.end(
                output={"retrieved_runbooks": context_documents}
            )

    except Exception as exc:
        logger.exception("ChromaDB retrieval failed")

        if rag_span is not None:
            try:
                rag_span.end(
                    output={"error": str(exc)},
                    level="ERROR",
                    status_message=str(exc),
                )
            except Exception:
                logger.exception("Could not close retrieval span")

    # Collect current container telemetry.
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT DISTINCT ON (container_name) "
                "container_name, status "
                "FROM docker_metrics "
                "ORDER BY container_name, id DESC;"
            )
            rows = cursor.fetchall()

        telemetry = "Live Containers Fleet Status:\n"
        telemetry += "\n".join(
            f"- {name}: {container_status}"
            for name, container_status in rows
        )

    except Exception:
        logger.exception("Telemetry query failed")
        telemetry = "Telemetry tracking stream offline."

    rag_context = (
        "\n".join(context_documents)
        if context_documents
        else "No explicit runbooks found for this issue."
    )

    system_prompt = f"""
You are an infrastructure diagnostics assistant.

[LIVE INFRASTRUCTURE TELEMETRY]
{telemetry}

[KNOWLEDGE BASE RUNBOOKS]
{rag_context}

Return only valid JSON with these keys:
- incident_detected: boolean
- error_scope: string
- diagnostic_report: string

Identify containers whose status is not 'running'.
Do not include greetings or text outside the JSON object.
"""

    fallback_json = (
        '{"incident_detected":false,'
        '"error_scope":"Offline Core Node",'
        '"diagnostic_report":"Unable to communicate with Ollama."}'
    )

    reply_text = fallback_json

    try:
        # Create the generation observation using the v2 API.
        if trace_obj is not None:
            generation = trace_obj.generation(
                name="ollama_inference_generation",
                model=target_model,
                input={"message": user_message},
            )

        client = ollama.Client(host=ollama_host)

        result = client.chat(
            model=target_model,
            format="json",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )

        reply_text = result["message"]["content"]

        if generation is not None:
            generation.end(output=reply_text)

        if trace_obj is not None:
            trace_obj.update(
                output={
                    "status": "success",
                    "reply": reply_text,
                }
            )

    except Exception as exc:
        logger.exception("Ollama inference failed")

        if generation is not None:
            try:
                generation.end(
                    output={"error": str(exc)},
                    level="ERROR",
                    status_message=str(exc),
                )
            except Exception:
                logger.exception("Could not close generation")

        if trace_obj is not None:
            try:
                trace_obj.update(
                    output={"status": "failed", "error": str(exc)}
                )
            except Exception:
                logger.exception("Could not update trace")

    finally:
        try:
            langfuse_client.flush()
        except Exception:
            logger.exception("Langfuse flush failed")

    return response.Response(
        {"reply": reply_text},
        status=status.HTTP_200_OK,
    )

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
