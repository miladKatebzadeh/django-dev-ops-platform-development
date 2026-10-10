'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Server, Database, Sparkles, Activity, Settings2 } from 'lucide-react'

type SettingsSection = 'ollama' | 'telemetry' | 'knowledge'

const settingsTabs = [
    { id: 'ollama', label: 'Ollama LLM Node', icon: Sparkles },
    { id: 'telemetry', label: 'HCI & Telemetry', icon: Activity },
    { id: 'knowledge', label: 'ChromaDB Knowledge', icon: Database },
] as const

function PanelHeader({ eyebrow, title, icon: Icon, action }: { eyebrow: string; title: string; icon: any; action?: React.ReactNode }) {
    return (
        <div className="panel-header">
            <div className="panel-title-wrap">
                <div className="panel-icon"><Icon size={16} /></div>
                <div>
                    <div className="eyebrow">{eyebrow}</div>
                    <h2>{title}</h2>
                </div>
            </div>
            {action}
        </div>
    )
}

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('ollama')
    const [settingsSaving, setSettingsSaving] = useState(false)

    // Ollama State Configuration
    const [ollamaHost, setOllamaHost] = useState('http://localhost:11434')
    const [ollamaModel, setOllamaModel] = useState('qwen2.5-coder:7b')

    // Infrastructure Telemetry Target Configuration
    const [prometheusUrl, setPrometheusUrl] = useState('http://localhost:9090')
    const [jenkinsUrl, setJenkinsUrl] = useState('http://localhost:8080')
    const [scrapeInterval, setScrapeInterval] = useState('15')

    // ChromaDB Semantic Cluster Configuration
    const [chromaHost, setChromaHost] = useState('localhost')
    const [chromaPort, setChromaHostPort] = useState('8001')
    const [embeddingEngine, setEmbeddingEngine] = useState('all-MiniLM-L6-v2')

    // Auto-Discovery Model Lists
    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [isFetchingModels, setIsFetchingModels] = useState(false)

    // Dynamic hook to discover active language models on the user's laptop filesystem
    const triggerModelDiscovery = async () => {
        setIsFetchingModels(true)
        try {
            const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')
            const response = await fetch(`${baseUrl}/mcp/settings/models/`)
            if (response.ok) {
                const res = await response.json()
                if (res.status === 'success' && res.models && res.models.length > 0) {
                    setAvailableModels(res.models)
                    if (!res.models.includes(ollamaModel)) {
                        setOllamaModel(res.models[0])
                    }
                } else {
                    setAvailableModels([])
                }
            }
        } catch (err) {
            console.error("Failed to map dynamic models manifest context:", err)
        } finally {
            setIsFetchingModels(false)
        }
    }

    useEffect(() => {
        triggerModelDiscovery()
    }, [])

    const handleGlobalSync = async (payload: object) => {
        setSettingsSaving(true)
        try {
            const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')
            const response = await fetch(`${baseUrl}/mcp/settings/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            if (response.ok) {
                alert('Cluster parameters synchronized successfully! 🎉')
            } else {
                alert('Cluster rejected properties update payload.')
            }
        } catch {
            alert('Communication runtime thread exception caught.')
        } finally {
            setSettingsSaving(false)
        }
    }

    return (
        <main className="app-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: '60px' }}>
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            {/* Global Application Nav Header */}
            <header className="topbar" style={{ flexShrink: 0 }}>
                <div className="brand">
                    <div className="brand-mark"><span /><span /><span /></div>
                    <div><strong>OPS<span>HUB</span></strong><small>GLOBAL PLATFORM BLUEPRINT</small></div>
                </div>
                <div className="top-actions">
                    <button onClick={() => window.location.href = '/'} className="refresh-button" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <ArrowLeft size={14} /> Back to Dashboard
                    </button>
                </div>
            </header>

            {/* Minimal Header Space Layout */}
            <section className="hero" style={{ padding: '42px 0 28px' }}>
                <div>
                    <div className="hero-kicker"><span /> SYSTEM ENVIRONMENT <span className="line" /></div>
                    <h1 style={{ margin: '12px 0 0', fontSize: '32px' }}>Cluster Management</h1>
                </div>
            </section>

            {/* Synchronized Core Width Layout Grid */}
            <div style={{ maxWidth: '1260px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Horizontal Navigation Link Tabs */}
                <nav className="tabs" style={{ margin: 0, width: '100%' }}>
                    {settingsTabs.map((tab) => {
                        const Icon = tab.icon
                        const isActive = activeSection === tab.id
                        return (
                            <button
                                key={tab.id}
                                className={isActive ? 'active' : ''}
                                onClick={() => setActiveSection(tab.id)}
                                style={{ paddingBottom: '14px' }}
                            >
                                <Icon size={15} />
                                {tab.label}
                            </button>
                        )
                    })}
                </nav>

                {/* Dynamic Full-Width Active Workspace Panel View */}
                <div className="active-view" style={{ padding: 0, margin: 0, width: '100%', maxWidth: '100%' }}>
                    <section className="panel" style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', width: '100%', height: 'auto' }}>

                        {/* View Scope 1: Ollama Engine Configuration Parameters */}
                        {activeSection === 'ollama' && (
                            <>
                                <PanelHeader eyebrow="OLLAMA ENVIRONMENT ENGINE" title="Core LLM Runtime Properties" icon={Sparkles} />
                                <div className="field-grid" style={{ gridTemplateColumns: '1fr', padding: '20px 18px' }}>
                                    <div className="settings-input-card">
                                        <span>OLLAMA EDGE NODE HOST ROUTE</span>
                                        <input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder="http://localhost:11434" />
                                    </div>

                                    <div className="settings-input-card" style={{ marginTop: '16px' }}>
                                        <span>TARGET AI COGNITIVE MODEL SELECTOR</span>
                                        {availableModels.length > 0 ? (
                                            <select
                                                value={ollamaModel}
                                                onChange={(e) => setOllamaModel(e.target.value)}
                                                style={{ width: '100%', background: 'var(--background)', border: '1px solid var(--line)', padding: '11px 14px', borderRadius: '6px', fontSize: '11px', color: 'var(--foreground)', outline: 'none', cursor: 'pointer' }}
                                            >
                                                {availableModels.map((modelName) => (
                                                    <option key={modelName} value={modelName} style={{ background: 'var(--panel)', color: 'var(--foreground)' }}>
                                                        {modelName}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                                <input
                                                    value={ollamaModel}
                                                    onChange={(e) => setOllamaModel(e.target.value)}
                                                    placeholder="qwen2.5-coder:7b"
                                                />
                                                <small style={{ fontSize: '9px', color: 'var(--red)', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                                                    {isFetchingModels ? "🔄 SCANNING LOCAL REGISTRY..." : "⚠️ OLLAMA NODE UNREACHABLE OR MODEL MANIFEST EMPTY. OPERATING IN MANUAL MODE."}
                                                </small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleGlobalSync({ ollama_host: ollamaHost, ollama_model: ollamaModel })}
                                    disabled={settingsSaving}
                                    className="compile-button"
                                    style={{ margin: '0 18px 20px', width: 'calc(100% - 36px)', cursor: 'pointer' }}
                                >
                                    {settingsSaving ? 'Syncing Environment...' : 'Commit Model Settings'}
                                </button>
                            </>
                        )}

                        {/* View Scope 2: HCI Telemetry Parameters Configuration */}
                        {activeSection === 'telemetry' && (
                            <>
                                <PanelHeader eyebrow="INFRASTRUCTURE MONITOR INTEGRATION" title="Telemetry Metrics & Pipeline Scrapers" icon={Activity} />
                                <div className="field-grid" style={{ gridTemplateColumns: '1fr', padding: '20px 18px' }}>
                                    <div className="settings-input-card">
                                        <span>PROMETHEUS ENGINE TARGET SERVICE ENDPOINT</span>
                                        <input value={prometheusUrl} onChange={(e) => setPrometheusUrl(e.target.value)} placeholder="http://localhost:9090" />
                                    </div>
                                    <div className="settings-input-card" style={{ marginTop: '16px' }}>
                                        <span>JENKINS CI/CD CONTROLLER BASE API URL</span>
                                        <input value={jenkinsUrl} onChange={(e) => setJenkinsUrl(e.target.value)} placeholder="http://localhost:8080" />
                                    </div>
                                    <div className="settings-input-card" style={{ marginTop: '16px' }}>
                                        <span>DAEMON SCRAPE POLLING INTERVAL (SECONDS)</span>
                                        <input type="number" value={scrapeInterval} onChange={(e) => setScrapeInterval(e.target.value)} placeholder="15" />


                                        <button
                                            onClick={() => handleGlobalSync({ prometheus_url: prometheusUrl, jenkins_url: jenkinsUrl, scrape_interval: scrapeInterval })}
                                            disabled={settingsSaving}
                                            className="compile-button"
                                            style={{ margin: '0 18px 20px', width: 'calc(100% - 36px)', cursor: 'pointer' }}
                                        >
                                            {settingsSaving ? 'Syncing Environment...' : 'Commit Scraper Settings'}

                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                        {/* View Scope 3: ChromaDB Base Vector Configuration Context */}
                        {activeSection === 'knowledge' && (
                            <>

                                <div className="field-grid" style={{ gridTemplateColumns: '1fr', padding: '20px 18px' }}>

                                    <span>CHROMADB MEMORY CLUSTER ENDPOINT IP / HOST</span>
                                    <input value={chromaHost} onChange={(e) => setChromaHost(e.target.value)} placeholder="localhost" />

                                    <div className="settings-input-card" style={{ marginTop: '16px' }}>
                                        <span>ACTIVE COMMUNICATIONS INTERFACE ROUTING PORT</span>
                                        <input value={chromaPort} onChange={(e) => setChromaHostPort(e.target.value)} placeholder="8001" />

                                        <div className="settings-input-card" style={{ marginTop: '16px' }}>
                                            <span>DEFAULT INFERENCE EMBEDDING MODEL WEIGHTS</span>
                                            <input value={embeddingEngine} onChange={(e) => setEmbeddingEngine(e.target.value)} placeholder="all-MiniLM-L6-v2" />


                                            <button
                                                onClick={() => handleGlobalSync({ chroma_host: chromaHost, chroma_port: chromaPort, embedding_engine: embeddingEngine })}
                                                disabled={settingsSaving}
                                                className="compile-button"
                                                style={{ margin: '0 18px 20px', width: 'calc(100% - 36px)', cursor: 'pointer' }}
                                            >
                                                {settingsSaving ? 'Syncing Environment...' : 'Commit Vector Settings'}

                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>
                </div>
            </div>
        </main>
    )
}