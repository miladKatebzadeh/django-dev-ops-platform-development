from django.urls import reverse
from rest_framework.test import APITestCase

from .models import MCPTool


class MCPToolApiTests(APITestCase):
    def test_tool_lifecycle_requires_confirmation_for_delete(self):
        create = self.client.post('/api/mcp/tools/', {
            'name': 'restart_container',
            'description': 'Restart a container safely',
            'code': 'return name',
            'status': 'active',
        }, format='json')
        self.assertEqual(create.status_code, 201)
        tool_id = create.data['id']

        denied = self.client.delete(f'/api/mcp/tools/{tool_id}/')
        self.assertEqual(denied.status_code, 400)
        self.assertTrue(MCPTool.objects.get(id=tool_id).archived_at is None)

        deleted = self.client.delete(f'/api/mcp/tools/{tool_id}/?confirm=true')
        self.assertEqual(deleted.status_code, 204)
        archived_tool = MCPTool.objects.get(id=tool_id)
        self.assertIsNotNone(archived_tool.archived_at)
        self.assertEqual(archived_tool.status, 'archived')

    def test_tool_update_creates_version(self):
        create = self.client.post('/api/mcp/tools/', {
            'name': 'get_status',
            'description': 'Read status',
            'code': 'return "ok"',
            'status': 'active',
        }, format='json')
        tool_id = create.data['id']
        updated = self.client.patch(f'/api/mcp/tools/{tool_id}/', {'description': 'Read live status'}, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(MCPTool.objects.get(id=tool_id).versions.count(), 2)
