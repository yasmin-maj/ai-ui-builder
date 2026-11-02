import type { CSSProperties } from 'react'
import type { ThemeTokens } from './types'

/** Map page/app theme → builder chrome (exterior) CSS variables. */
export function shellThemeVars(theme: ThemeTokens): CSSProperties {
  const dark = theme.mode === 'dark'
  const bg = theme.background || (dark ? '#07111f' : '#F1F5F9')
  const panel = theme.surface || (dark ? '#0d1829' : '#FFFFFF')
  const text = theme.text || (dark ? '#e8eef8' : '#0F172A')
  const muted = theme.muted || (dark ? '#93a4bd' : '#64748B')
  const border = theme.border || (dark ? '#1F2937' : '#E2E8F0')
  const primary = theme.primary || '#0F766E'
  const accent = theme.accent || '#F59E0B'

  return {
    ['--shell-bg' as string]: bg,
    ['--shell-panel' as string]: panel,
    ['--shell-text' as string]: text,
    ['--shell-muted' as string]: muted,
    ['--shell-line' as string]: dark ? 'rgba(148, 163, 184, 0.18)' : border,
    ['--shell-accent' as string]: primary,
    ['--shell-accent-2' as string]: accent,
    ['--shell-danger' as string]: '#fb7185',
    ['--p' as string]: primary,
    ['--s' as string]: theme.secondary || primary,
    ['--a' as string]: accent,
    ['--bg' as string]: bg,
    ['--sf' as string]: panel,
    ['--tx' as string]: text,
    ['--mu' as string]: muted,
    ['--bd' as string]: border,
    ['--rd' as string]: theme.radius || '14px',
    color: text,
    background: bg,
    fontFamily: theme.fontFamily,
  }
}

export function applyDocumentShellTheme(theme: ThemeTokens) {
  const vars = shellThemeVars(theme) as Record<string, string>
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith('--')) root.style.setProperty(key, value)
  }
  const dark = theme.mode === 'dark'
  const primary = theme.primary || '#0F766E'
  const accent = theme.accent || '#F59E0B'
  const bg = theme.background || (dark ? '#07111f' : '#F1F5F9')
  document.body.style.background = dark
    ? `radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, ${primary} 28%, transparent), transparent 55%),
       radial-gradient(900px 400px at 90% 0%, color-mix(in srgb, ${accent} 18%, transparent), transparent 50%),
       linear-gradient(180deg, ${bg} 0%, color-mix(in srgb, ${bg} 85%, #000) 100%)`
    : `radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, ${primary} 16%, transparent), transparent 55%),
       radial-gradient(900px 400px at 90% 0%, color-mix(in srgb, ${accent} 12%, transparent), transparent 50%),
       linear-gradient(180deg, #fff 0%, ${bg} 100%)`
  document.body.style.color = theme.text || (dark ? '#e8eef8' : '#0F172A')
  root.dataset.shellMode = dark ? 'dark' : 'light'
}
