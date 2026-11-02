import { Moon, Palette, Sun } from 'lucide-react'
import type { ThemeTokens } from '../types'
import { DefaultThemes } from '../themeDefaults'

type Props = {
  theme: ThemeTokens
  onChange: (theme: ThemeTokens) => void
}

const PRESETS: Array<{ name: string; primary: string; secondary: string; accent: string }> = [
  { name: 'Teal', primary: '#0F766E', secondary: '#134E4A', accent: '#F59E0B' },
  { name: 'Blue', primary: '#2563EB', secondary: '#1E40AF', accent: '#38BDF8' },
  { name: 'Rose', primary: '#E11D48', secondary: '#9F1239', accent: '#FB7185' },
  { name: 'Violet', primary: '#7C3AED', secondary: '#5B21B6', accent: '#F59E0B' },
  { name: 'Orange', primary: '#EA580C', secondary: '#C2410C', accent: '#FBBF24' },
  { name: 'Ink', primary: '#0F172A', secondary: '#334155', accent: '#22D3EE' },
]

function withPrimary(theme: ThemeTokens, primary: string, secondary?: string, accent?: string): ThemeTokens {
  return {
    ...theme,
    primary,
    secondary: secondary ?? shade(primary, theme.mode === 'dark' ? 0.35 : -0.22),
    accent: accent ?? theme.accent,
  }
}

function shade(hex: string, amount: number): string {
  const n = hex.replace('#', '')
  if (n.length !== 6) return hex
  const num = Number.parseInt(n, 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + Math.round(255 * amount)))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + Math.round(255 * amount)))
  const b = Math.min(255, Math.max(0, (num & 255) + Math.round(255 * amount)))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function ThemeQuickBar({ theme, onChange }: Props) {
  const setMode = (mode: 'light' | 'dark') => {
    const base = mode === 'dark' ? DefaultThemes.dark : DefaultThemes.light
    onChange({
      ...base,
      primary: theme.primary,
      secondary: theme.secondary,
      accent: theme.accent,
      radius: theme.radius,
      fontFamily: theme.fontFamily,
      mode,
    })
  }

  return (
    <div className="theme-quick">
      <span className="theme-quick-label">
        <Palette size={14} />
        ثيم الواجهة + الصفحة
      </span>

      <label className="theme-quick-swatch" title="اللون الأساسي">
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(theme.primary) ? theme.primary : '#0F766E'}
          onChange={(e) => onChange(withPrimary(theme, e.target.value))}
        />
        <span>أساسي</span>
      </label>

      <label className="theme-quick-swatch" title="لون مميز">
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(theme.accent) ? theme.accent : '#F59E0B'}
          onChange={(e) => onChange({ ...theme, accent: e.target.value })}
        />
        <span>Accent</span>
      </label>

      <div className="theme-presets" role="list">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className={`theme-preset ${theme.primary.toLowerCase() === p.primary.toLowerCase() ? 'active' : ''}`}
            style={{ background: p.primary }}
            title={p.name}
            aria-label={p.name}
            onClick={() => onChange(withPrimary(theme, p.primary, p.secondary, p.accent))}
          />
        ))}
      </div>

      <div className="mode-toggle compact">
        <button type="button" className={theme.mode === 'light' ? 'active' : ''} onClick={() => setMode('light')}>
          <Sun size={14} />
        </button>
        <button type="button" className={theme.mode === 'dark' ? 'active' : ''} onClick={() => setMode('dark')}>
          <Moon size={14} />
        </button>
      </div>
    </div>
  )
}
