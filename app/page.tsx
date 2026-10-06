'use client'

import { useEffect, useMemo, useState } from 'react'

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) } })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const detail = typeof payload.detail === 'string'
      ? payload.detail
      : Object.entries(payload).flatMap(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : String(messages)}`).join(' | ')
    throw new Error(detail || `Backend request failed (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
import { Activity, ArrowUpRight, Bot, CheckCircle2, CircleDot, Code2, Cpu, Database, FileCode2, Gauge, Layers3, MessageSquare, Network, Play, Search, Server, Settings2, Sparkles, Terminal, Trash2, Upload, Wifi, XCircle, Zap } from 'lucide-react'

const tabs = [
  { id: 'analytics', label: 'Live Infrastructure', icon: Activity },
  { id: 'knowledge', label: 'ChromaDB Knowledge', icon: Database },
  { id: 'lab', label: 'Hybrid AI & MCP Lab', icon: Bot },
] as const
type TabId = (typeof tabs)[number]['id']
type DynamicTool = { id: string | number; name: string; description: string; code?: string; created?: string }
const codeSample = `@mcp.tool()\ndef restart_container(name: str) -> str:\n    # Custom tool code injected dynamically\n    return "Container restarted successfully"`

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'orange' | 'red' }) { return <span className={`status-dot status-${tone}`} aria-label={`${tone} status`} /> }
function PanelHeader({ eyebrow, title, icon: Icon, action }: { eyebrow: string; title: string; icon: typeof Activity; action?: React.ReactNode }) { return <div className="panel-header"><div className="panel-title-wrap"><div className="panel-icon"><Icon size={16} /></div><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div></div>{action}</div> }


interface TelemetryData {
  metrics: { system_health: string; active_containers: string; pipelines_today: string; telemetry_events: string };
  containers: string[][];
  builds: string[][];
  core_metrics: string[][];
}


function AnalyticsView({
  data,
  error,
  loading,
  selectedMetrics,
  setSelectedMetrics
}: {
  data: TelemetryData | null;
  error: string | null;
  loading: boolean;
  selectedMetrics: string[];
  setSelectedMetrics: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  if (loading && !data) {
    return <div className="empty-state">Loading infrastructure telemetry...</div>
  }

  if (error) {
    return <div className="empty-state" style={{ color: 'var(--orange)' }}>Error loading telemetry: {error}</div>
  }

  const metrics = data?.metrics ?? { system_health: '0%', active_containers: '0', pipelines_today: '0', telemetry_events: '0 rows' }
  const containers = data?.containers ?? []
  const builds = data?.builds ?? []
  const coreMetrics = data?.core_metrics ?? []

  // 🌟 کل کاتالوگ متریک‌های موجود در دیتابیس برای فیلتر کردن
  const allAvailableFromDb = data?.all_available_metrics ?? [];

  const toggleMetricSelection = (mName: string) => {
    setSelectedMetrics(prev =>
      prev.includes(mName) ? prev.filter(m => m !== mName) : [...prev, mName]
    );
  };

  return (
    <div className="view-stack">
      {/* بخش کارت‌های بالایی داشبورد فیلتر کانتینرها بدون تغییر رندر می‌شود */}
      <div className="metric-grid">
        {[
          ['System health', metrics.system_health, 'Based on active nodes', Gauge, 'green'],
          ['Active containers', metrics.active_containers, 'Live operational fleet', Server, 'blue'],
          ['Pipelines today', metrics.pipelines_today, 'Latest CI build updates', Network, 'orange'],
          ['Telemetry events', metrics.telemetry_events, 'Flushed rows in DB', Activity, 'purple']
        ].map(([label, value, hint, Icon, tone]) => {
          const MetricIcon = Icon as React.ElementType;
          return (
            <div className="metric-card" key={String(label)}>
              <div className={`metric-icon ${String(tone)}`}><MetricIcon size={17} /></div>
              <span>{String(label)}</span>
              <strong>{String(value)}</strong>
              <small>{String(hint)}</small>
            </div>
          )
        })}
      </div>

      {/* ستون‌های کانتینرها و جنکینز */}
      <div className="data-columns">
        <section className="panel">
          <PanelHeader eyebrow="DOCKER / LIVE TELEMETRY" title="Container fleet" icon={Server} action={<span className="live-pill"><StatusDot /> LIVE</span>} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Container</th><th>Status</th><th>CPU</th><th>Memory</th></tr></thead>
              <tbody>
                {containers.map((row, idx) => (
                  <tr key={idx}>
                    <td><div className="table-name"><span className="mini-server"><Server size={13} /></span>{row[0]}</div></td>
                    <td><span className="status-text"><StatusDot tone={row[1] === 'running' ? 'green' : 'red'} />{row[1]}</span></td>
                    <td>{row[2]}</td><td>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {containers.length === 0 && <div className="empty-state">No containers logged in database.</div>}
          </div>
        </section>

        <section className="panel">
          <PanelHeader eyebrow="JENKINS / CI PIPELINES" title="Recent builds" icon={Layers3} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pipeline</th><th>Build</th><th>Result</th><th>Duration</th></tr></thead>
              <tbody>
                {builds.map((row, idx) => (
                  <tr className={row[2] === 'FAILURE' ? 'danger-row' : ''} key={idx}>
                    <td>{row[0]}</td><td className="muted">{row[1]}</td>
                    <td><span className={`result ${row[2].toLowerCase()}`}>{row[2] === 'SUCCESS' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{row[2]}</span></td>
                    <td className="muted">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {builds.length === 0 && <div className="empty-state">No pipeline histories discovered.</div>}
          </div>
        </section>
      </div>

      {/* 🌟 بخش پیشرفته و پویا شده پرومتئوس همراه با منوی فیلتر متریک‌ها */}
      <section className="panel prometheus-panel">
        <PanelHeader
          eyebrow="PROMETHEUS / CUSTOM MONITOR"
          title="Core system metrics"
          icon={Cpu}
          action={
            <button
              className="refresh-button"
              onClick={() => setShowConfig(!showConfig)}
              style={{ border: showConfig ? '1px solid var(--orange)' : '1px solid #303642' }}
            >
              <Settings2 size={13} /> {showConfig ? 'Close Manager' : 'Manage Metrics'}
            </button>
          }
        />

        {/* پنل انتخاب متریک‌ها (نمایش با دکمه Manage Metrics) */}
        {showConfig && (
          <div style={{ padding: '18px', borderBottom: '1px solid #222730', background: '#0b0d12' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <input
                // style={{ flex: 1, background: '#12161f', border: '1px solid #2d3545', padding: '8px 12px', borderRadius: '4px', fontSize: '11px', color: '#fff' }}
                placeholder="Search metrics catalog..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '150px', overflowY: 'auto', padding: '4px' }}>
              {allAvailableFromDb
                .filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(mName => {
                  const isSelected = selectedMetrics.includes(mName);
                  return (
                    <button
                      key={mName}
                      onClick={() => toggleMetricSelection(mName)}
                      // style={{
                      //   fontSize: '9px',
                      //   padding: '5px 9px',
                      //   borderRadius: '3px',
                      //   border: isSelected ? '1px solid var(--orange)' : '1px solid #242832',
                      //   background: isSelected ? '#ff7a3515' : '#101217',
                      //   color: isSelected ? 'var(--orange)' : '#8b929e',
                      //   fontFamily: 'monospace'
                      // }}
                    >
                      {isSelected ? '✓ ' : '+ '} {mName}
                    </button>
                  )
                })}
            </div>
          </div>
        )}

        <div className="metric-log">
          {coreMetrics.map((item, i) => {
            const [metricName, displayValue, description, barPercent] = item;
            return (
              <div className="log-row" key={i}>
                <span className="log-index">0{i + 1}</span>
                <span className="log-key">{metricName}</span>
                <strong>{displayValue}</strong>
                <span className="muted">{description}</span>
                <span className="log-bars"><i style={{ width: `${barPercent}%`, transition: 'width 0.4s ease' }} /></span>
              </div>
            );
          })}
          {coreMetrics.length === 0 && <div className="empty-state">No selected metrics. Click 'Manage Metrics' to add channels.</div>}
        </div>
      </section>
    </div>
  )
}


function KnowledgeView() {
  const [documents, setDocuments] = useState<any[]>([])
  const [loadError, setLoadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [chromaStatus, setChromaStatus] = useState<'connected' | 'offline'>('offline')

  const fetchDocuments = () => {
    apiRequest<any[]>('/knowledge/documents/')
      .then((res) => {
        setDocuments(Array.isArray(res) ? res : (res as any).results || [])
        // 🌟 اگر اتصال برقرار باشد، بک‌اِند خطا نمی‌دهد و وضعیت را سبز می‌کنیم
        setChromaStatus('connected')
      })
      .catch((error) => {
        setLoadError(error.message)
        // 🌟 در صورت بروز هرگونه خطای اتصال کلاستر، وضعیت آفلاین می‌شود
        setChromaStatus('offline')
      })
  }


  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setDocTitle(file.name.replace(/\.[^/.]+\$/, ""))
      setEditingDocId(null)
    }
  }

  const startEditing = (doc: any) => {
    setEditingDocId(doc.id)
    setDocTitle(doc.title)
    setDocContent(doc.content || '')
    setSelectedFile(null)
  }

  const cancelEditing = () => {
    setEditingDocId(null)
    setDocTitle('')
    setDocContent('')
  }

  const handleIngestOrUpdate = async () => {
    if (!selectedFile && !docTitle.trim() && !docContent.trim()) return
    setUploading(true)

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/\$/, '')

      if (editingDocId) {
        const payload = {
          title: docTitle || 'Untitled Runbook',
          content: docContent,
        }

        const response = await fetch(`${baseUrl}/knowledge/documents/${editingDocId}/`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        })

        if (!response.ok) throw new Error(`Update pipeline failed (${response.status})`)

      } else {
        const formData = new FormData()
        if (selectedFile) {
          formData.append('file', selectedFile)
        } else {
          formData.append('content', docContent)
        }
        formData.append('title', docTitle || selectedFile?.name || 'Untitled Runbook')
        formData.append('source', 'Manual Ingestion')

        const response = await fetch(`${baseUrl}/knowledge/documents/`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) throw new Error(`Ingestion pipeline failed (${response.status})`)
      }

      setSelectedFile(null)
      setDocTitle('')
      setDocContent('')
      setEditingDocId(null)
      fetchDocuments()
    } catch (error: any) {
      setLoadError(error.message)
    } finally {
      setUploading(false)
    }
  }

  const removeDocument = async (id: string, title: string) => {
    if (!window.confirm(`Delete ${title} from ChromaDB?`)) return
    try {
      await apiRequest(`/knowledge/documents/${id}/?confirm=true`, { method: 'DELETE' })
      if (editingDocId === id) cancelEditing()
      setDocuments((current) => current.filter((doc) => String(doc.id) !== String(id)))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Delete failed')
    }
  }

  return (
    <div className="view-stack">
      <div className="chroma-hero panel">
        <div className="chroma-brand">
          <div className="chroma-mark"><Database size={22} /></div>
          <div>
            <div className="eyebrow">VECTOR DATABASE CLUSTER</div>
            <h2>ChromaDB knowledge base</h2>
            <p>Semantic memory layer for DevOps-Brain</p>
          </div>
        </div>
        <div className="connection" style={{ borderColor: chromaStatus === 'connected' ? '#2a4733' : '#552a2a', background: chromaStatus === 'connected' ? '#ffffff' : '#201010' }}>
          <StatusDot tone={chromaStatus === 'connected' ? 'green' : 'red'} />
          <div>
            <strong>{chromaStatus === 'connected' ? 'Connected' : 'Disconnected'}</strong>
            <span style={{ color: chromaStatus === 'connected' ? '#74827b' : '#827474' }}>localhost : 8001</span>
          </div>
          <Wifi size={19} style={{ color: chromaStatus === 'connected' ? '#6ebf88' : '#bf6e6e' }} />
        </div>

      </div>

      {loadError && (
        <div className="empty-state" style={{ color: 'var(--orange)', border: '1px dashed var(--orange)' }}>
          ⚠️ Pipeline Warning: {loadError}
        </div>
      )}

      <div className="knowledge-grid">
        <section className="panel">
          <PanelHeader
            eyebrow="COLLECTION / DEVOPS_KNOWLEDGE_BASE"
            title="Indexed documents"
            icon={FileCode2}
            action={<span className="muted">{documents.length} documents</span>}
          />
          <div className="document-list">
            {documents.map((doc) => (
              <div className="document" key={doc.id}>
                <div className="doc-icon"><FileCode2 size={15} /></div>
                <div className="doc-info">
                  <strong>{doc.title}</strong>
                  <span>{doc.source ?? 'Knowledge base'} · {doc.content?.length ?? 0} chars</span>
                </div>
                <span className="muted" style={{ marginRight: 'auto', paddingRight: '12px' }}>
                  <button
                    className="row-action"
                    title="Edit Document"
                    onClick={() => startEditing(doc)}
                    style={{ border: editingDocId === doc.id ? '1px solid var(--orange)' : '1px solid #303743' }}
                  >
                    <Settings2 size={13} style={{ color: editingDocId === doc.id ? 'var(--orange)' : 'inherit' }} />
                  </button>
                </span>
                <button
                  className="row-action danger"
                  aria-label={`Delete ${doc.title}`}
                  title="Delete from ChromaDB"
                  onClick={() => removeDocument(String(doc.id), doc.title)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {documents.length === 0 && <div className="empty-state">No documents in this collection.</div>}
        </section>

        <section className="panel ingest-panel">
          <PanelHeader
            eyebrow="INGESTION PIPELINE"
            title={editingDocId ? "Edit Knowledge Asset" : "Add knowledge"}
            icon={Upload}
          />
          <p className="panel-copy">
            {editingDocId
              ? "Modifying the semantic vector blueprint. Changes will realign inside ChromaDB in real-time."
              : "Push runbooks, incident notes, and system manuals into the semantic retrieval layer."}
          </p>

          <div style={{ padding: '0 18px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '9px', color: '#68707d', letterSpacing: '.1em' }}>DOCUMENT TITLE</span>
              <input
                // style={{ width: '100%', background: '#0b0e12', border: '1px solid #303743', padding: '8px 11px', borderRadius: '5px', fontSize: '11px', color: '#fff', outline: 'none' }}
                placeholder="Document Title"
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '9px', color: '#68707d', letterSpacing: '.1em' }}>CONTENT MANUAL</span>
              <textarea
                // style={{ width: '100%', minHeight: '120px', resize: 'vertical', background: '#f2f4f6', border: '1px solid #303743', padding: '8px 11px', borderRadius: '5px', fontSize: '11px', color: '#b7d2e8', outline: 'none', fontFamily: 'monospace', lineHeight: '1.6' }}
                placeholder="Write or paste your runbook manual markdown contents directly here..."
                value={docContent}
                onChange={e => setDocContent(e.target.value)}
              />
            </label>
          </div>

          {!editingDocId && (
            <label className="drop-zone" style={{ border: selectedFile ? '1px dashed var(--green)' : '1px dashed #3b4654', cursor: 'pointer', margin: '14px 18px' }}>
              <input type="file" accept=".txt,.md,.pdf" onChange={handleFileChange} />
              <Upload size={22} style={{ color: selectedFile ? 'var(--green)' : '#7795be' }} />
              <strong>{selectedFile ? selectedFile.name : 'Drop files to ingest'}</strong>
              <span>Markdown, PDF, TXT up to 25 MB</span>
            </label>
          )}

          <div style={{ display: 'flex', gap: '8px', padding: '0 18px', marginTop: '14px', marginBottom: '18px' }}>
            <button
              className="outline-button"
              onClick={handleIngestOrUpdate}
              disabled={uploading || (!selectedFile && !docTitle.trim() && !docContent.trim())}
              style={{ flex: 1, margin: 0, opacity: uploading ? 0.5 : 1, cursor: uploading ? 'not-allowed' : 'pointer', background: editingDocId ? '#ff7a3515' : 'transparent', color: editingDocId ? 'var(--orange)' : '#c2cad4', borderColor: editingDocId ? 'var(--orange)' : '#39424f' }}
            >
              <Upload size={15} /> {uploading ? 'Processing Vectors...' : editingDocId ? 'Update Asset' : 'Add document'}
            </button>

            {editingDocId && (
              <button
                className="refresh-button"
                onClick={cancelEditing}
                style={{ height: '37px', padding: '0 14px' }}
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}


function LabView() {
  const [tools, setTools] = useState<DynamicTool[]>([])
  useEffect(() => { apiRequest<DynamicTool[]>('/mcp/tools/').then(setTools).catch(() => undefined) }, [])
  const [toolName, setToolName] = useState('restart_container')
  const [description, setDescription] = useState('Safely restart a named Docker container')
  const [code, setCode] = useState(codeSample)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; time: string }[]>([{ role: 'assistant', text: 'Hello. I can inspect telemetry, search ChromaDB runbooks, and safely execute loaded MCP tools. What would you like to investigate?', time: 'now' }])
  const [toast, setToast] = useState('')
  const toolCount = useMemo(() => tools.length, [tools])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  const removeTool = async (tool: DynamicTool) => { if (!window.confirm(`Remove ${tool.name} from the MCP runtime?`)) return; try { await apiRequest(`/mcp/tools/${tool.id}/?confirm=true`, { method: 'DELETE' }); setTools((current) => current.filter((item) => String(item.id) !== String(tool.id))); notify(`${tool.name} removed from runtime manager`) } catch (error) { notify(error instanceof Error ? error.message : 'Remove failed') } }
  const register = async () => {
    const cleanName = toolName.trim().replace(/\s+/g, '_')
    if (!cleanName) return
    const payload = { name: cleanName, description: description || 'Dynamic MCP runtime tool', code }
    try {
      const existing = tools.find((tool) => tool.name === cleanName)
      const saved = existing
        ? await apiRequest<DynamicTool>(`/mcp/tools/${existing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiRequest<DynamicTool>('/mcp/tools/', { method: 'POST', body: JSON.stringify(payload) })
      setTools((current) => [saved, ...current.filter((tool) => String(tool.id) !== String(saved.id))])
      notify(`${cleanName} ${existing ? 'updated' : 'compiled and loaded'} in runtime manager`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Register failed')
    }
  }
  const sendMessage = () => { const clean = query.trim(); if (!clean) return; setMessages((current) => [...current, { role: 'user', text: clean, time: 'now' }, { role: 'assistant', text: `I analyzed the request across live telemetry and ${toolCount} loaded MCP tools. The stack is responding normally; I recommend reviewing the latest pipeline failure and the postgres runbook before taking action.`, time: 'just now' }]); setQuery('') }
  return <div className="lab-grid"><section className="panel tool-panel"><PanelHeader eyebrow="RUNTIME EXTENSION LAYER" title="Dynamic MCP Tool Creator" icon={Code2} action={<span className="compile-status"><CircleDot size={12} /> READY</span>} /><div className="field-grid"><label><span>Tool Name</span><input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="restart_container" /></label><label><span>Tool Description</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this tool do?" /></label></div><label className="code-editor"><div className="editor-top"><span><Code2 size={13} /> tool_definition.py</span><span>PYTHON 3.12</span></div><textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} /></label><button className="compile-button" onClick={register}><Zap size={16} /> Register &amp; Compile Tool <span><Play size={13} /></span></button><div className="section-label"><span>Active hot-pluggable tools</span><small>{toolCount} loaded</small></div><div className="tool-buttons">{tools.map((tool) => <div className="tool-row" key={tool.id}><button className="tool-button" onClick={() => notify(`${tool.name} executed successfully`)}><div className="tool-button-icon"><Terminal size={14} /></div><div><strong>{tool.name}</strong><span>{tool.description}</span></div><ArrowUpRight size={14} /></button><button className="row-action danger" aria-label={`Remove ${tool.name}`} title="Remove MCP tool" onClick={() => removeTool(tool)}><Trash2 size={14} /></button></div>)}</div></section><section className="panel console-panel"><PanelHeader eyebrow="NATURAL LANGUAGE OPS" title="AI Diagnostic Console" icon={MessageSquare} action={<span className="online"><StatusDot /> ONLINE</span>} /><div className="chat-toolbar"><div className="bot-avatar"><Sparkles size={20} /></div><div><strong>DevOps-Brain</strong><span>Context: telemetry + ChromaDB + MCP runtime</span></div><span className="secure-badge">SAFE MODE</span></div><div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.time}-${index}`}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={13} /> : 'MK'}</div><div className="message-body"><div className="message-meta"><strong>{message.role === 'assistant' ? 'DevOps-Brain' : 'You'}</strong><span>{message.time}</span></div><p>{message.text}</p>{message.role === 'assistant' && index === messages.length - 1 && <div className="source-chips"><span>ChromaDB</span><span>Prometheus</span><span>MCP runtime</span></div>}</div></div>)}</div><div className="ask-bar"><Search size={16} /><input aria-label="Ask DevOps-Brain" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) sendMessage() }} placeholder="Ask about your infrastructure..." /><button onClick={sendMessage} aria-label="Send message"><ArrowUpRight size={16} /></button></div><div className="console-footer"><span><CheckCircle2 size={13} /> Responses are grounded in connected sources</span><span>Enter to send · Shift+Enter for newline</span></div></section>{toast && <div className="toast"><CheckCircle2 size={15} />{toast}</div>}</div>
}
export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>('analytics');
  const [telemetryData, setTelemetryData] = useState<TelemetryData | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // 🌟 ذخیره و لود متریک‌های انتخاب شده از LocalStorage
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('opshub_filtered_metrics');
      return saved ? JSON.parse(saved) : ['node_cpu_seconds_total', 'node_memory_MemAvailable_bytes', 'node_filesystem_free_bytes', 'node_network_receive_bytes_total'];
    }
    return [];
  });

  // ذخیره در دیسک مرورگر هنگام تغییر فیلترها
  useEffect(() => {
    localStorage.setItem('opshub_filtered_metrics', JSON.stringify(selectedMetrics));
  }, [selectedMetrics]);

  const fetchTelemetry = async (showSyncIndicator = false) => {
    if (showSyncIndicator) setIsSyncing(true);
    try {
      // 🌟 فرستادن لیست متریک‌های فیلتر شده به صورت کوئری استرینگ به جنگو
      const metricsParam = encodeURIComponent(JSON.stringify(selectedMetrics));
      const res = await apiRequest<TelemetryData>(`/infrastructure/telemetry/?filtered_metrics=${metricsParam}`);
      setTelemetryData(res);
      setTelemetryError(null);
    } catch (err: any) {
      setTelemetryError(err.message);
    } finally {
      setTelemetryLoading(false)
      if (showSyncIndicator) {
        setTimeout(() => setIsSyncing(false), 600);
      }
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(() => fetchTelemetry(false), 15000);
    return () => clearInterval(interval);
  }, [selectedMetrics]); // 🌟 رفرش آنی به محض تغییر فیلترها

  const ActiveIcon = tabs.find((tab) => tab.id === activeTab)?.icon ?? Activity;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand">
          {/* <div className="brand-mark"><span /><span /><span /></div> */}
          <div><strong>OPS<span>HUB</span></strong><small>AI OBSERVABILITY PLATFORM</small></div>
        </div>
        {/* <div className="top-actions"> */}
        {/* <span className="system-status"><StatusDot tone={telemetryError ? 'red' : 'green'} /> {telemetryError ? 'SYSTEM DEGRADED' : 'ALL SYSTEMS NOMINAL'}</span> */}
        {/* <button className="icon-button" aria-label="Settings"><Settings2 size={17} /></button> */}
        {/* <div className="avatar">MK</div> */}
        {/* </div> */}
      </header>

      <section className="hero">
        <div>
          <div className="hero-kicker"><span /> AIOPS CONTROL PLANE <span className="line" /></div>
          <h1>Infrastructure intelligence<br /><em>daskldna.</em></h1>
          <p>Observe every layer. Query any signal. Deploy intelligence into your runtime.</p>
        </div>
        <div className="hero-meta">
          {/* <div><span>UPTIME</span><strong>99.98%</strong></div>
          <div><span>REGION</span><strong>EU-WEST-1</strong></div> */}
          <div><span>LAST SYNC</span><strong>{isSyncing ? 'Syncing...' : 'Just now'}</strong></div>
        </div>
      </section>

      <nav className="tabs" aria-label="Dashboard views">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              <Icon size={15} />{tab.label}
              <span>{tab.id === 'analytics' ? '01' : tab.id === 'knowledge' ? '02' : '03'}</span>
            </button>
          )
        })}
      </nav>

      <div className="active-view">
        <div className="view-heading">
          <div>
            <span className="eyebrow">{activeTab === 'analytics' ? 'REAL-TIME TELEMETRY' : activeTab === 'knowledge' ? 'SEMANTIC RETRIEVAL LAYER' : 'EXTENSIBLE INTELLIGENCE'}</span>
            <h2><ActiveIcon size={19} />{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
          </div>
          <div className="view-actions">
            <span className="last-updated"><Activity size={13} /> Auto-refresh enabled</span>
            <button
              className="refresh-button"
              onClick={() => fetchTelemetry(true)}
              disabled={isSyncing}
              style={{ opacity: isSyncing ? 0.6 : 1, cursor: isSyncing ? 'not-allowed' : 'pointer' }}
            >
              <Activity size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        </div>
        {activeTab === 'analytics' ? (
          <AnalyticsView
            data={telemetryData}
            error={telemetryError}
            loading={telemetryLoading}
            selectedMetrics={selectedMetrics}
            setSelectedMetrics={setSelectedMetrics}
          />
        ) : activeTab === 'knowledge' ? (
          <KnowledgeView />
        ) : (
          <LabView />
        )}
      </div>
    </main>
  )
}
