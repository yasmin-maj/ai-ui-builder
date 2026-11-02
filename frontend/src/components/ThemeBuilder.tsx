import { Moon, Sun } from 'lucide-react'
import type { ThemeTokens } from '../types'
import { DefaultThemes } from '../themeDefaults'

type Props = {
  theme: ThemeTokens
  onChange: (theme: ThemeTokens) => void
}

const colorFields: Array<{ key: keyof ThemeTokens; label: string }> = [
  { key: 'primary', label: 'أساسي (Primary)' },
  { key: 'secondary', label: 'ثانوي' },
  { key: 'accent', label: 'مميز (Accent)' },
  { key: 'background', label: 'خلفية' },
  { key: 'surface', label: 'سطح' },
  { key: 'text', label: 'نص' },
  { key: 'muted', label: 'نص خافت' },
  { key: 'border', label: 'حدود' },
]

const PRESETS: Array<{ name: string; primary: string; secondary: string; accent: string }> = [
  { name: 'Teal', primary: '#0F766E', secondary: '#134E4A', accent: '#F59E0B' },
  { name: 'Blue', primary: '#2563EB', secondary: '#1E40AF', accent: '#38BDF8' },
  { name: 'Rose', primary: '#E11D48', secondary: '#9F1239', accent: '#FB7185' },
  { name: 'Violet', primary: '#7C3AED', secondary: '#5B21B6', accent: '#F59E0B' },
  { name: 'Orange', primary: '#EA580C', secondary: '#C2410C', accent: '#FBBF24' },
]

export function ThemeBuilder({ theme, onChange }: Props) {
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
    <div className="side-section">
      <div className="side-title-row">
        <h3>ثيم التطبيق</h3>
        <div className="mode-toggle">
          <button type="button" className={theme.mode === 'light' ? 'active' : ''} onClick={() => setMode('light')}>
            <Sun size={14} /> فاتح
          </button>
          <button type="button" className={theme.mode === 'dark' ? 'active' : ''} onClick={() => setMode('dark')}>
            <Moon size={14} /> داكن
          </button>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 0 }}>
        بيطبّق على واجهة الـ Builder الخارجية + الصفحة جوا الـ Space.
      </p>

      <div className="theme-presets editor">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className={`theme-preset ${theme.primary.toLowerCase() === p.primary.toLowerCase() ? 'active' : ''}`}
            style={{ background: p.primary }}
            title={p.name}
            onClick={() =>
              onChange({
                ...theme,
                primary: p.primary,
                secondary: p.secondary,
                accent: p.accent,
              })
            }
          />
        ))}
      </div>

      <div className="color-grid">
        {colorFields.map(({ key, label }) => (
          <label key={key} className="color-field">
            <span>{label}</span>
            <input
              type="color"
              value={normalizeHex(String(theme[key]))}
              onChange={(e) => onChange({ ...theme, [key]: e.target.value })}
            />
            <input
              type="text"
              value={String(theme[key])}
              onChange={(e) => onChange({ ...theme, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <label className="field">
        الحواف (Radius)
        <input
          type="number"
          min={0}
          step={1}
          value={radiusNumber(theme.radius)}
          onChange={(e) => {
            const raw = e.target.value
            const n = raw === '' ? 0 : Math.max(0, Number(raw))
            onChange({ ...theme, radius: `${Number.isFinite(n) ? n : 0}px` })
          }}
        />
      </label>
    </div>
  )
}

function radiusNumber(value: string): number {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function normalizeHex(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'
}
