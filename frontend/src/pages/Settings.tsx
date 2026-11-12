import { useEffect, useState } from 'react'
import {
  Sparkles,
  Cpu,
  Key,
  Check,
  Eye,
  EyeOff,
  Sliders,
  Calendar,
  AlertCircle,
  Film,
  Bot,
  Copy,
  ExternalLink,
  Code,
  Zap,
} from 'lucide-react'

import {
  api,
  type McpConfig,
  type ProviderStatus,
  type Settings as SettingsData,
  type SystemStatus,
} from '../api'

const SECRET_LABELS: Record<string, string> = {
  gemini: 'Google Gemini API Key',
  anthropic: 'Anthropic Claude API Key',
  openai: 'OpenAI-compatible API Key',
  huggingface_token: 'HuggingFace Access Token',
}

const PROVIDER_METADATA: Record<
  string,
  {
    label: string
    desc: string
    keyName: string
    docsUrl: string
    docsLabel: string
    models: string[]
    baseUrls?: { name: string; url: string }[]
  }
> = {
  gemini: {
    label: 'Google Gemini',
    desc: 'High-speed viral detection. 100% free with no credit card required.',
    keyName: 'gemini',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Get free key at Google AI Studio',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  anthropic: {
    label: 'Anthropic Claude',
    desc: 'Exceptional creative director reasoning, story structure, and pacing.',
    keyName: 'anthropic',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get key at Anthropic Console',
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  },
  openai: {
    label: 'OpenAI / Compatible',
    desc: 'Compatible with OpenAI, OpenRouter, Groq, DeepSeek, and custom LLM servers.',
    keyName: 'openai',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get key at OpenAI / OpenRouter',
    models: ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'llama-3.3-70b-versatile'],
    baseUrls: [
      { name: 'OpenAI Default', url: '' },
      { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
      { name: 'Groq (Fast)', url: 'https://api.groq.com/openai/v1' },
      { name: 'Local Ollama', url: 'http://localhost:11434/v1' },
    ],
  },
  ollama: {
    label: 'Local Ollama',
    desc: '100% offline and private. Runs directly on your hardware with no API keys.',
    keyName: '',
    docsUrl: 'https://ollama.com',
    docsLabel: 'Install Ollama locally',
    models: ['llama3.2', 'mistral', 'qwen2.5', 'phi3'],
  },
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null)
  const [installingMcp, setInstallingMcp] = useState(false)
  const [copiedMcpSnippet, setCopiedMcpSnippet] = useState(false)
  const [showMcpSnippet, setShowMcpSnippet] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Smart cadence mock state (can be saved in localStorage or settings)
  const [dailyCap, setDailyCap] = useState<number>(() => {
    return Number(localStorage.getItem('clipcut_daily_cap')) || 3
  })

  const [customSlotTimes, setCustomSlotTimes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('clipcut_custom_slots')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length >= 5) return parsed
      }
    } catch {}
    return ['12:00', '17:30', '20:30', '09:00', '15:00']
  })

  const handleUpdateSlotTime = (index: number, newTime: string) => {
    const updated = [...customSlotTimes]
    updated[index] = newTime
    setCustomSlotTimes(updated)
    localStorage.setItem('clipcut_custom_slots', JSON.stringify(updated))
    setSavedMessage(`Slot ${index + 1} updated to ${newTime}`)
    setTimeout(() => setSavedMessage(null), 2000)
  }

  const reload = () => {
    void api.getSettings().then(setSettings).catch((e) => setError(e as Error))
    void api.providerStatus().then(setProviders).catch(() => undefined)
    void api.system().then(setSystem).catch(() => undefined)
    void api.getMcpConfig().then(setMcpConfig).catch(() => undefined)
  }

  const handleInstallMcp = async () => {
    setInstallingMcp(true)
    setError(null)
    try {
      const res = await api.installMcpConfig()
      setSavedMessage(res.message)
      reload()
      setTimeout(() => setSavedMessage(null), 5000)
    } catch (err: any) {
      setError(err as Error)
    } finally {
      setInstallingMcp(false)
    }
  }

  const handleCopyMcp = () => {
    if (!mcpConfig?.json_snippet) return
    navigator.clipboard.writeText(mcpConfig.json_snippet)
    setCopiedMcpSnippet(true)
    setTimeout(() => setCopiedMcpSnippet(false), 2000)
  }

  useEffect(reload, [])

  const patch = async (update: Partial<SettingsData>) => {
    setError(null)
    try {
      const updated = await api.putSettings(update)
      setSettings(updated)
      setSavedMessage('Settings saved')
      setTimeout(() => setSavedMessage(null), 2000)
    } catch (err: any) {
      setError(err as Error)
    }
  }

  const handleUpdateDailyCap = (cap: number) => {
    setDailyCap(cap)
    localStorage.setItem('clipcut_daily_cap', String(cap))
    setSavedMessage(`Daily upload target updated to ${cap} Shorts/day`)
    setTimeout(() => setSavedMessage(null), 2000)
  }

  if (!settings) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        <p className="mt-4 text-xs font-semibold text-ink-600">Loading ClipCut settings...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 py-10">
      {/* ---------------- Header ---------------- */}
      <div className="flex flex-col justify-between gap-4 border-b border-canvas-200 pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            <Sliders className="h-3.5 w-3.5 text-purple-600" />
            <span>Studio Preferences & Config</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-ink-950">Preferences & Diagnostics</h1>
          <p className="text-sm text-ink-600">
            Configure AI directors, upload cadence patterns, Whisper STT, and GPU hardware acceleration.
          </p>
        </div>

        {savedMessage && (
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm animate-fade-in">
            <Check className="h-4 w-4 text-emerald-600" />
            <span>{savedMessage}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{error.message || String(error)}</span>
        </div>
      )}

      {/* ---------------- CARD 1: AI Provider & Models ---------------- */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
            <Sparkles className="h-4 w-4" />
            <span>AI Director & Vision Engine</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-ink-950">Active LLM Provider</h3>
          <p className="text-xs text-ink-500">
            Select which reasoning model inspects transcripts, scores retention hooks, and drafts narrative B-roll scripts.
          </p>
        </div>

        {/* Provider Selectable Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((p) => {
            const isSelected = p.name === settings.active_provider
            const meta = PROVIDER_METADATA[p.name]
            return (
              <div
                key={p.name}
                onClick={() => patch({ active_provider: p.name })}
                className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-600'
                    : 'border-canvas-200 bg-canvas-50 hover:border-canvas-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm capitalize text-ink-950">
                    {meta?.label || p.name}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-purple-700" />}
                </div>
                <p className="mt-1 text-[11px] text-ink-500 leading-snug line-clamp-2">
                  {meta?.desc || 'LLM reasoning adapter'}
                </p>
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${p.available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className={p.available ? 'font-semibold text-emerald-800' : 'text-amber-800'}>
                      {p.available ? 'Ready' : p.detail || 'Needs Key'}
                    </span>
                  </div>
                  {p.has_key && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      Key Saved
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Model & Base URL Inputs */}
        <div className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
                Model Name ({PROVIDER_METADATA[settings.active_provider]?.label || settings.active_provider})
              </label>
            </div>
            <input
              type="text"
              value={settings.providers[settings.active_provider]?.model ?? ''}
              onChange={(e) =>
                patch({
                  providers: {
                    [settings.active_provider]: {
                      ...settings.providers[settings.active_provider],
                      model: e.target.value,
                    },
                  },
                })
              }
              placeholder="e.g. gemini-2.0-flash or claude-3-5-sonnet-latest"
              className="mt-1.5 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3.5 py-2.5 text-xs text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
            />

            {/* Quick Model Presets */}
            {PROVIDER_METADATA[settings.active_provider]?.models && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-ink-400">Presets:</span>
                {PROVIDER_METADATA[settings.active_provider].models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      patch({
                        providers: {
                          [settings.active_provider]: {
                            ...settings.providers[settings.active_provider],
                            model: m,
                          },
                        },
                      })
                    }
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-mono transition-colors ${
                      settings.providers[settings.active_provider]?.model === m
                        ? 'bg-purple-700 text-white font-bold'
                        : 'bg-canvas-200 text-ink-700 hover:bg-canvas-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
              Base URL (Optional)
            </label>
            <input
              type="text"
              value={settings.providers[settings.active_provider]?.base_url ?? ''}
              onChange={(e) =>
                patch({
                  providers: {
                    [settings.active_provider]: {
                      ...settings.providers[settings.active_provider],
                      base_url: e.target.value || null,
                    },
                  },
                })
              }
              placeholder="e.g. OpenRouter, Groq, or http://localhost:11434"
              className="mt-1.5 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3.5 py-2.5 text-xs text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
            />

            {/* Quick Base URL Presets */}
            {PROVIDER_METADATA[settings.active_provider]?.baseUrls && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-ink-400">Endpoints:</span>
                {PROVIDER_METADATA[settings.active_provider].baseUrls!.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() =>
                      patch({
                        providers: {
                          [settings.active_provider]: {
                            ...settings.providers[settings.active_provider],
                            base_url: b.url || null,
                          },
                        },
                      })
                    }
                    className={`rounded-lg px-2 py-0.5 text-[10px] transition-colors ${
                      (settings.providers[settings.active_provider]?.base_url ?? '') === b.url
                        ? 'bg-purple-700 text-white font-bold'
                        : 'bg-canvas-200 text-ink-700 hover:bg-canvas-300'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inline API Key Saver for Active Provider */}
        {PROVIDER_METADATA[settings.active_provider]?.keyName ? (
          <div className="border-t border-canvas-200 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-purple-700" />
                <span className="text-xs font-bold text-ink-900">
                  {PROVIDER_METADATA[settings.active_provider].label} API Key
                </span>
              </div>
              <a
                href={PROVIDER_METADATA[settings.active_provider].docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:underline"
              >
                <span>{PROVIDER_METADATA[settings.active_provider].docsLabel}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <ModernSecretField
              secretKey={PROVIDER_METADATA[settings.active_provider].keyName}
              label={SECRET_LABELS[PROVIDER_METADATA[settings.active_provider].keyName]}
              present={settings.keys_present[PROVIDER_METADATA[settings.active_provider].keyName] ?? false}
              onChanged={reload}
              onError={setError}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Ollama runs 100% locally and requires no API key or internet connection.</span>
          </div>
        )}
      </div>

      {/* ---------------- CARD 2: Claude Desktop MCP Integration ---------------- */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
              <Bot className="h-4 w-4" />
              <span>Model Context Protocol (MCP)</span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-ink-950">Claude Desktop Integration</h3>
            <p className="text-xs text-ink-500">
              Control ClipCut directly from Claude Desktop. Direct video hooks, inspect transcripts, and iterate scripts from chat.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {mcpConfig?.connected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Claude Desktop Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Not Connected
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleInstallMcp}
            disabled={installingMcp}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-800 transition-colors disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            <span>{installingMcp ? 'Configuring...' : '1-Click Auto-Configure Claude Desktop'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyMcp}
            className="inline-flex items-center gap-2 rounded-xl border border-canvas-300 bg-canvas-50 px-4 py-2.5 text-xs font-semibold text-ink-800 hover:bg-white transition-colors"
          >
            {copiedMcpSnippet ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4 text-purple-700" />
            )}
            <span>{copiedMcpSnippet ? 'Copied Config JSON!' : 'Copy Config JSON'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMcpSnippet(!showMcpSnippet)}
            className="text-xs font-semibold text-purple-700 hover:underline inline-flex items-center gap-1"
          >
            <Code className="h-3.5 w-3.5" />
            <span>{showMcpSnippet ? 'Hide Details' : 'View Config Snippet & Path'}</span>
          </button>
        </div>

        {/* Expandable Snippet Box */}
        {showMcpSnippet && (
          <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 space-y-3 text-xs animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-ink-600">
              <span className="font-semibold">Claude Desktop Config Path:</span>
              <span className="font-mono text-[11px] text-purple-700 font-bold select-all break-all">
                {mcpConfig?.config_path || '%APPDATA%\\Claude\\claude_desktop_config.json'}
              </span>
            </div>

            <pre className="rounded-xl border border-canvas-200 bg-white p-3 font-mono text-[11px] text-ink-800 overflow-x-auto select-all leading-relaxed">
              {mcpConfig?.json_snippet || 'Loading config snippet...'}
            </pre>

            <p className="text-[11px] text-ink-500">
              💡 After clicking <strong>Auto-Configure</strong> or saving the snippet, completely quit and restart Claude Desktop. The tools icon will appear in your Claude input bar!
            </p>
          </div>
        )}
      </div>

      {/* ---------------- CARD 2: Smart YouTube Cadence & Scheduling ---------------- */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
            <Calendar className="h-4 w-4" />
            <span>Publishing Cadence & Smart Slots</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-ink-950">Shorts Distribution Schedule</h3>
          <p className="text-xs text-ink-500">
            Prevents uploading in erratic batches. Automatically calculates optimal high-retention windows and spaces out uploads across peak audience hours.
          </p>
        </div>

        {/* Daily Upload Target Picker */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
            Daily Recommended Shorts Cap
          </label>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((cap) => (
              <button
                key={cap}
                type="button"
                onClick={() => handleUpdateDailyCap(cap)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  dailyCap === cap
                    ? 'bg-purple-700 text-white shadow-sm ring-1 ring-purple-600'
                    : 'border border-canvas-300 bg-canvas-50 text-ink-700 hover:bg-white'
                }`}
              >
                {cap} {cap === 1 ? 'Short / day' : 'Shorts / day'}
              </button>
            ))}
          </div>
        </div>

        {/* Custom High-Retention Time Slots */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
              Custom Upload Time Slots ({dailyCap} active)
            </label>
            <span className="text-[11px] text-ink-500">Local time (HH:MM)</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: dailyCap }).map((_, idx) => {
              const defaultSlotsInfo = [
                { name: 'Midday Lunch', hint: 'High engagement during lunchtime mobile browsing.' },
                { name: 'Evening Rush', hint: 'Peak scroll volume as viewers commute home.' },
                { name: 'Night Prime', hint: 'Highest watch completion rates and comment activity.' },
                { name: 'Morning Scroll', hint: 'Early-bird viewers catching up on new trends.' },
                { name: 'Afternoon Break', hint: 'Post-lunch leisure browsing window.' },
              ]
              const desc = defaultSlotsInfo[idx] || { name: `Slot ${idx + 1}`, hint: 'Custom target time' }
              const timeVal = customSlotTimes[idx] || '12:00'
              return (
                <div key={idx} className="rounded-2xl border border-canvas-200 bg-canvas-50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Slot {idx + 1} • {desc.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={timeVal}
                      onChange={(e) => handleUpdateSlotTime(idx, e.target.value)}
                      className="rounded-xl border border-canvas-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-ink-900 focus:border-purple-600 focus:outline-none"
                    />
                    <span className="text-xs text-ink-600 font-medium">
                      {(() => {
                        try {
                          const [hStr, mStr] = timeVal.split(':')
                          const h = parseInt(hStr, 10)
                          const m = parseInt(mStr, 10)
                          const ampm = h >= 12 ? 'PM' : 'AM'
                          const dispH = h % 12 || 12
                          return `${dispH}:${m < 10 ? '0' + m : m} ${ampm}`
                        } catch {
                          return timeVal
                        }
                      })()}
                    </span>
                  </div>

                  <p className="text-[11px] text-ink-500 leading-snug">{desc.hint}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-xs text-purple-950">
          <strong>Pacing Guardrail:</strong> When you click <em>Publish Short</em> in the studio, ClipCut automatically inspects today's schedule. If today's {dailyCap} slots are already booked, it automatically buffers to tomorrow's Slot 1 so your videos never compete with each other.
        </div>
      </div>

      {/* ---------------- CARD 3: API Keys & Credentials Vault ---------------- */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
            <Key className="h-4 w-4" />
            <span>Secure Keyring Vault</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-ink-950">API Keys & Access Tokens</h3>
          <p className="text-xs text-ink-500">
            Keys are encrypted in your local operating system keyring. They are never transmitted to third parties.
          </p>
        </div>

        <div className="space-y-4">
          {Object.entries(SECRET_LABELS).map(([key, label]) => (
            <ModernSecretField
              key={key}
              secretKey={key}
              label={label}
              present={settings.keys_present[key] ?? false}
              onChanged={reload}
              onError={setError}
            />
          ))}
        </div>
      </div>

      {/* ---------------- CARD 4: Whisper Speech-to-Text & Ingestion ---------------- */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
            <Film className="h-4 w-4" />
            <span>Audio Transcription & Ingestion</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-ink-950">Whisper AI Configuration</h3>
          <p className="text-xs text-ink-500">
            Word-level timestamp extraction model used for subtitles and creative director analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
              Whisper Model Size
            </label>
            <select
              value={settings.whisper.model}
              onChange={(e) => patch({ whisper: { ...settings.whisper, model: e.target.value } })}
              className="mt-1.5 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3.5 py-2.5 text-xs font-bold text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
            >
              <option value="tiny">Tiny (Fastest, ~1GB VRAM)</option>
              <option value="base">Base (Balanced, ~1.5GB VRAM)</option>
              <option value="small">Small (Recommended, ~2GB VRAM)</option>
              <option value="medium">Medium (High Accuracy, ~5GB VRAM)</option>
              <option value="large-v3">Large-v3 (Maximum Accuracy, ~10GB VRAM)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
              Spoken Language
            </label>
            <input
              type="text"
              value={settings.whisper.language ?? ''}
              onChange={(e) => patch({ whisper: { ...settings.whisper, language: e.target.value } })}
              placeholder="auto (or en, es, fr...)"
              className="mt-1.5 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3.5 py-2.5 text-xs text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* YouTube Cookies Selector */}
        <div className="pt-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
            YouTube Cookies from Browser
          </label>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Passes authenticated session cookies to yt-dlp to bypass bot detection on age-gated or protected videos.
          </p>
          <select
            value={settings.ingest.cookies_from_browser ?? ''}
            onChange={(e) => patch({ ingest: { ...settings.ingest, cookies_from_browser: e.target.value } })}
            className="mt-1.5 w-full max-w-sm rounded-xl border border-canvas-300 bg-canvas-50 px-3.5 py-2.5 text-xs font-bold text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
          >
            <option value="">None (Anonymous download)</option>
            <option value="chrome">Google Chrome</option>
            <option value="firefox">Mozilla Firefox</option>
            <option value="edge">Microsoft Edge</option>
            <option value="brave">Brave Browser</option>
          </select>
        </div>
      </div>

      {/* ---------------- CARD 5: Video Export Defaults & Hardware Telemetry ---------------- */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
            <Cpu className="h-4 w-4" />
            <span>Hardware Diagnostics & FFmpeg</span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-ink-950">System Telemetry</h3>
          <p className="text-xs text-ink-500">
            Local hardware encoder, CUDA acceleration status, and system environment.
          </p>
        </div>

        {system && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-ink-500">Acceleration</span>
              <p className="font-extrabold text-xs text-ink-950">{system.accel.toUpperCase()}</p>
            </div>
            <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-ink-500">Graphics Device</span>
              <p className="font-extrabold text-xs text-ink-950 truncate">{system.gpu_name || 'CPU Only'}</p>
            </div>
            <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-ink-500">FFmpeg Engine</span>
              <p className="font-extrabold text-xs text-ink-950 truncate">{system.ffmpeg_version?.slice(0, 15) || 'Available'}</p>
            </div>
            <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-ink-500">Subtitle Burner</span>
              <p className="font-extrabold text-xs text-emerald-700">{system.has_libass ? 'Libass Active' : 'Fallback'}</p>
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <input
            type="checkbox"
            id="nvenc_check"
            checked={settings.export.prefer_hardware_encoder}
            onChange={(e) => patch({ export: { ...settings.export, prefer_hardware_encoder: e.target.checked } })}
            className="h-4 w-4 rounded accent-purple-700"
          />
          <label htmlFor="nvenc_check" className="text-xs font-semibold text-ink-800">
            Prefer NVIDIA NVENC Hardware Video Encoding (Faster Exports)
          </label>
        </div>
      </div>
    </div>
  )
}

function ModernSecretField({
  secretKey,
  label,
  present,
  onChanged,
  onError,
}: {
  secretKey: string
  label: string
  present: boolean
  onChanged: () => void
  onError: (err: Error) => void
}) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const save = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await api.putSecret(secretKey, value.trim())
      setValue('')
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      onChanged()
    } catch (err: any) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 transition-all hover:bg-white hover:border-canvas-300 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-ink-900">{label}</label>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            present ? 'bg-emerald-100 text-emerald-800' : 'bg-canvas-200 text-ink-500'
          }`}
        >
          {present ? 'Key Configured' : 'Missing'}
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={present ? '••••••••••••••••••••' : 'Paste new key here...'}
            className="w-full rounded-xl border border-canvas-300 bg-white px-3.5 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-2.5 text-ink-400 hover:text-ink-700"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>

        <button
          type="button"
          disabled={saving || !value.trim()}
          onClick={save}
          className="rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 disabled:opacity-40 transition-colors shrink-0"
        >
          {saving ? 'Saving...' : justSaved ? 'Saved!' : 'Save Key'}
        </button>
      </div>
    </div>
  )
}
