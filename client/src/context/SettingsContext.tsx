import { createContext, useEffect, useState, useCallback, ReactNode } from 'react'

/* ── Types ──────────────────────────────────────────────── */
export type ThemeMode = 'light' | 'dark' | 'system'
export type TextScale = 'sm' | 'base' | 'lg' | 'xl'
export type AccentColor = 'teal' | 'blue' | 'purple' | 'amber'

export interface UISettings {
  theme: ThemeMode
  textScale: TextScale
  accentColor: AccentColor
  compactMode: boolean
  reduceMotion: boolean
  sidebarCollapsed: boolean
}

export interface SettingsContextValue extends UISettings {
  update: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void
  reset: () => void
}

/* ── Defaults ───────────────────────────────────────────── */
const DEFAULTS: UISettings = {
  theme: 'light',
  textScale: 'base',
  accentColor: 'teal',
  compactMode: false,
  reduceMotion: false,
  sidebarCollapsed: false,
}

const STORAGE_KEY = 'financeai-ui-settings'

/* ── Helpers ────────────────────────────────────────────── */
function loadSettings(): UISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* corrupt data — fall back */ }
  return { ...DEFAULTS }
}

function saveSettings(s: UISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyToDOM(settings: UISettings) {
  const html = document.documentElement

  // Theme
  html.setAttribute('data-theme', resolveTheme(settings.theme))

  // Text scale
  if (settings.textScale === 'base') {
    html.removeAttribute('data-text-scale')
  } else {
    html.setAttribute('data-text-scale', settings.textScale)
  }

  // Accent color
  html.setAttribute('data-accent', settings.accentColor)

  // Compact mode
  html.classList.toggle('compact', settings.compactMode)

  // Reduce motion
  html.classList.toggle('reduce-motion', settings.reduceMotion)
}

/* ── Context ────────────────────────────────────────────── */
export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UISettings>(loadSettings)

  // Apply on mount and whenever settings change
  useEffect(() => {
    applyToDOM(settings)
    saveSettings(settings)
  }, [settings])

  // Listen for OS theme changes when mode is "system"
  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyToDOM(settings)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings])

  const update = useCallback(<K extends keyof UISettings>(key: K, value: UISettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const reset = useCallback(() => {
    setSettings({ ...DEFAULTS })
  }, [])

  return (
    <SettingsContext.Provider value={{ ...settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  )
}