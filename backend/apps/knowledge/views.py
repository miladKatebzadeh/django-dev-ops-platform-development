import json
import uuid
import io
import chromadb
from chromadb.utils import embedding_functions
from django.utils import timezone
from rest_framework import viewsets, decorators, response
from django.db import connection
from .models import KnowledgeCollection, KnowledgeDocument
from .serializers import KnowledgeCollectionSerializer, KnowledgeDocumentSerializer
from apps.audit.models import AuditEvent

# تلاش برای نصب و استفاده از پکیج pypdf جهت پارس کردن فایل‌های باینری PDF
try:
    import pypdf
except ImportError:
    pypdf = None

# راه‌اندازی کلاینت ChromaDB (پورت ۸۰۰۱ داکر)
try:
    chroma_client = chromadb.HttpClient(host='localhost', port=8001)
    default_ef = embedding_functions.DefaultEmbeddingFunction()
    chroma_collection = chroma_client.get_or_create_collection(
        name="devops_knowledge_base", 
        embedding_function=default_ef
    )
    print(" Successfully connected to dockerized ChromaDB via localhost:8001")
except Exception as e:
    print(f" Warning: Could not connect to ChromaDB server: {e}")
    chroma_collection = None


def extract_text_from_pdf(pdf_file_bytes):
    """
    استخراج متون خالص از فایلهای باینری PDF و فیلتر کردن کاراکترهای پوچ و مخدوش
    """
    if not pypdf:
        return "[Error: pypdf library is not installed on host machine. Cannot extract PDF text.]"
    
    try:
        pdf_stream = io.BytesIO(pdf_file_bytes)
        reader = pypdf.PdfReader(pdf_stream)
        extracted_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
        return extracted_text
    except Exception as e:
        return f"[Error parsing PDF document bytes: {str(e)}]"


class CollectionViewSet(viewsets.ModelViewSet):
    serializer_class = KnowledgeCollectionSerializer
    queryset = KnowledgeCollection.objects.filter(archived_at__isnull=True).order_by('-updated_at')


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = KnowledgeDocumentSerializer
    queryset = KnowledgeDocument.objects.all().order_by('-updated_at')

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        if request.query_params.get('confirm') != 'true':
            return response.Response({'detail': 'Deletion requires confirm=true.'}, status=400)
        
        if chroma_collection:
            try: chroma_collection.delete(ids=[str(document.pk)])
            except Exception: pass

        document.archived_at = timezone.now()
        document.save(update_fields=['archived_at', 'updated_at'])
        AuditEvent.objects.create(action='delete', resource_type='document', resource_id=str(document.pk))
        return response.Response(status=204)

    def perform_update(self, serializer):
        document = serializer.save()
        
        if chroma_collection and document.content:
            try:
                chroma_collection.update(
                    ids=[str(document.pk)],
                    documents=[document.content],
                    metadatas=[{
                        "title": document.title,
                        "source": getattr(document, 'source', 'Manual Ingestion')
                    }]
                )
                print(f"   ✓ ChromaDB vector successfully updated for: '{document.title}'")
            except Exception as e:
                print(f"❌ Failed to update vector in ChromaDB: {e}")

    def create(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get('file')
        file_content = ""
        file_name = ""
        
        if uploaded_file:
            file_name = uploaded_file.name
            raw_bytes = uploaded_file.read()
            
            if file_name.lower().endswith('.pdf'):
                file_content = extract_text_from_pdf(raw_bytes)
            else:
                file_content = raw_bytes.decode('utf-8', errors='ignore')
                
            uploaded_file.seek(0)

        title = request.data.get('title', '').strip() or file_name or "Untitled Runbook"
        content = request.data.get('content', '').strip() or file_content
        source = request.data.get('source', 'Manual Ingestion').strip()

        title = title.replace('\x00', '').replace('\u0000', '')
        content = content.replace('\x00', '').replace('\u0000', '')
        source = source.replace('\x00', '').replace('\u0000', '')

        if not content.strip():
            return response.Response({"detail": "Unable to extract any valid text content from the uploaded file."}, status=400)

        default_collection = KnowledgeCollection.objects.filter(archived_at__isnull=True).first()
        if not default_collection:
            try: default_collection = KnowledgeCollection.objects.create(name="Global Ops Knowledge Base", provider="local")
            except Exception: default_collection = KnowledgeCollection.objects.create(provider="local")

        generated_external_id = f"ext_{uuid.uuid4().hex[:12]}"
        generated_id = str(uuid.uuid4())

        raw_data = {
            'title': title,
            'content': content,
            'external_id': generated_external_id,
            'collection': default_collection.pk,
            'collection_id': default_collection.pk
        }

        serializer = self.get_serializer(data=raw_data)
        if serializer.is_valid():
            document = serializer.save()
            generated_id = str(document.pk)
        else:
            with connection.cursor() as cursor:
                try:
                    cursor.execute(
                        """INSERT INTO knowledge_knowledgedocument (id, title, content, external_id, collection_id, created_at, updated_at) 
                           VALUES (%s, %s, %s, %s, %s, NOW(), NOW());""",
                        (generated_id, title, content, generated_external_id, default_collection.pk)
                    )
                except Exception:
                    cursor.execute(
                        """INSERT INTO knowledge_knowledgedocument (id, title, content, external_id, collection, created_at, updated_at) 
                           VALUES (%s, %s, %s, %s, %s, NOW(), NOW());""",
                        (generated_id, title, content, generated_external_id, default_collection.pk)
                    )

        if chroma_collection:
            try:
                chroma_collection.add(
                    ids=[generated_id],
                    documents=[content],
                    metadatas=[{"title": title, "source": source}]
                )
                print(f"   ✓ Vectorized database entry for '{title}' committed to ChromaDB cluster.")
            except Exception as e:
                print(f"❌ Failed to index document into ChromaDB: {e}")

        try: AuditEvent.objects.create(action='create', resource_type='document', resource_id=generated_id, payload={'title': title})
        except Exception: pass

        return response.Response({
            "id": generated_id,
            "title": title,
            "content": content[:200] + "...", # فرستادن خلاصه متن در ریسپانس جهت بهینه‌سازی حجم شبکه
            "external_id": generated_external_id
        }, status=201)

    @decorators.action(detail=False, methods=['get'])
    def search(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            qs = self.get_queryset().filter(archived_at__isnull=True)
            return response.Response(self.get_serializer(qs[:50], many=True).data)

        if chroma_collection:
            try:
                results = chroma_collection.query(query_texts=[query], n_results=10)
                matched_ids = results.get("ids", [[]])
                if matched_ids and matched_ids[0]:
                    qs = self.get_queryset().filter(pk__in=matched_ids[0], archived_at__isnull=True)
                    return response.Response(self.get_serializer(qs, many=True).data)
            except Exception as e:
                print(f" Vector search failed: {e}")

        qs = self.get_queryset().filter(archived_at__isnull=True)
        qs = qs.filter(title__icontains=query) | qs.filter(content__icontains=query)
        return response.Response(self.get_serializer(qs[:50], many=True).data)
