import type { ThemeTokens } from './types'

export const DefaultThemes: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    mode: 'light',
    primary: '#0F766E',
    secondary: '#134E4A',
    accent: '#F59E0B',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    text: '#0F172A',
    muted: '#64748B',
    border: '#E2E8F0',
    radius: '14px',
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif",
  },
  dark: {
    mode: 'dark',
    primary: '#2DD4BF',
    secondary: '#99F6E4',
    accent: '#FBBF24',
    background: '#0B1220',
    surface: '#111827',
    text: '#F8FAFC',
    muted: '#94A3B8',
    border: '#1F2937',
    radius: '14px',
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif",
  },
}
