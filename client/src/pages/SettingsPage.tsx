import { useSettings } from '../hooks/useSettings'
import type { ThemeMode, TextScale, AccentColor } from '../context/SettingsContext'
import {
  Sun,
  Moon,
  Monitor,
  Type,
  Palette,
  Minimize2,
  Zap,
  RotateCcw,
} from 'lucide-react'
import Button from '../components/ui/Button'
import './SettingsPage.css'

/* ── Option definitions ───────────────────────────────── */

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light',  label: 'Light',  icon: <Sun size={18} /> },
  { value: 'dark',   label: 'Dark',   icon: <Moon size={18} /> },
  { value: 'system', label: 'System', icon: <Monitor size={18} /> },
]

const TEXT_OPTIONS: { value: TextScale; label: string; preview: string }[] = [
  { value: 'sm',   label: 'Small',       preview: 'Aa' },
  { value: 'base', label: 'Default',     preview: 'Aa' },
  { value: 'lg',   label: 'Large',       preview: 'Aa' },
  { value: 'xl',   label: 'Extra Large', preview: 'Aa' },
]

const ACCENT_OPTIONS: { value: AccentColor; label: string; color: string }[] = [
  { value: 'teal',   label: 'Teal',   color: '#00D4AA' },
  { value: 'blue',   label: 'Blue',   color: '#3B82F6' },
  { value: 'purple', label: 'Purple', color: '#8B5CF6' },
  { value: 'amber',  label: 'Amber',  color: '#F59E0B' },
]

/* ── Component ────────────────────────────────────────── */

export default function SettingsPage() {
  const settings = useSettings()

  return (
    <div className="settings-page page">
      <div className="settings-page__header">
        <h2 className="settings-page__title">Settings</h2>
        <p className="settings-page__subtitle">Customize how FinanceAI looks and feels.</p>
      </div>

      {/* ── Appearance ── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">
          <Sun size={18} /> Appearance
        </h3>

        {/* Theme */}
        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">Theme</span>
            <span className="settings-page__row-desc">Choose light, dark, or match your system.</span>
          </div>
          <div className="settings-page__theme-picker">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-page__theme-btn ${settings.theme === opt.value ? 'settings-page__theme-btn--active' : ''}`}
                onClick={() => settings.update('theme', opt.value)}
                aria-pressed={settings.theme === opt.value}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Accent Color */}
        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">
              <Palette size={16} /> Accent Color
            </span>
            <span className="settings-page__row-desc">Primary highlight color used across the app.</span>
          </div>
          <div className="settings-page__accent-picker">
            {ACCENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-page__accent-btn ${settings.accentColor === opt.value ? 'settings-page__accent-btn--active' : ''}`}
                onClick={() => settings.update('accentColor', opt.value)}
                aria-label={opt.label}
                aria-pressed={settings.accentColor === opt.value}
              >
                <span
                  className="settings-page__accent-swatch"
                  style={{ background: opt.color }}
                />
                <span className="settings-page__accent-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Typography ── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">
          <Type size={18} /> Typography
        </h3>

        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">Text Size</span>
            <span className="settings-page__row-desc">Adjust the base font size for readability.</span>
          </div>
          <div className="settings-page__text-picker">
            {TEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-page__text-btn ${settings.textScale === opt.value ? 'settings-page__text-btn--active' : ''}`}
                onClick={() => settings.update('textScale', opt.value)}
                aria-pressed={settings.textScale === opt.value}
              >
                <span
                  className="settings-page__text-preview"
                  style={{ fontSize: opt.value === 'sm' ? '12px' : opt.value === 'base' ? '14px' : opt.value === 'lg' ? '17px' : '20px' }}
                >
                  {opt.preview}
                </span>
                <span className="settings-page__text-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Layout & Motion ── */}
      <section className="settings-page__section">
        <h3 className="settings-page__section-title">
          <Minimize2 size={18} /> Layout &amp; Motion
        </h3>

        {/* Compact Mode */}
        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">Compact Mode</span>
            <span className="settings-page__row-desc">Tighter spacing to show more content on screen.</span>
          </div>
          <button
            className={`settings-page__toggle ${settings.compactMode ? 'settings-page__toggle--on' : ''}`}
            onClick={() => settings.update('compactMode', !settings.compactMode)}
            role="switch"
            aria-checked={settings.compactMode}
          >
            <span className="settings-page__toggle-thumb" />
          </button>
        </div>

        {/* Reduce Motion */}
        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">
              <Zap size={16} /> Reduce Motion
            </span>
            <span className="settings-page__row-desc">Disable animations and transitions for accessibility.</span>
          </div>
          <button
            className={`settings-page__toggle ${settings.reduceMotion ? 'settings-page__toggle--on' : ''}`}
            onClick={() => settings.update('reduceMotion', !settings.reduceMotion)}
            role="switch"
            aria-checked={settings.reduceMotion}
          >
            <span className="settings-page__toggle-thumb" />
          </button>
        </div>

        {/* Sidebar Collapsed */}
        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">Sidebar Collapsed by Default</span>
            <span className="settings-page__row-desc">Start with the sidebar minimized to icon-only mode.</span>
          </div>
          <button
            className={`settings-page__toggle ${settings.sidebarCollapsed ? 'settings-page__toggle--on' : ''}`}
            onClick={() => settings.update('sidebarCollapsed', !settings.sidebarCollapsed)}
            role="switch"
            aria-checked={settings.sidebarCollapsed}
          >
            <span className="settings-page__toggle-thumb" />
          </button>
        </div>
      </section>

      {/* ── Reset ── */}
      <section className="settings-page__section settings-page__section--reset">
        <div className="settings-page__row">
          <div className="settings-page__row-text">
            <span className="settings-page__row-label">Reset to Defaults</span>
            <span className="settings-page__row-desc">Restore all settings to their original values.</span>
          </div>
          <Button variant="danger" size="sm" onClick={settings.reset}>
            <RotateCcw size={14} /> Reset
          </Button>
        </div>
      </section>
    </div>
  )
}