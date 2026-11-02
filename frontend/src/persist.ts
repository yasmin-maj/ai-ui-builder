import type { ThemeTokens } from './types'
import { DefaultThemes } from './themeDefaults'

const KEYS = {
  projectId: 'ai-ui-builder:projectId',
  theme: 'ai-ui-builder:theme',
  workspaceId: 'ai-ui-builder:workspaceId',
  pageId: 'ai-ui-builder:pageId',
} as const

export function loadSavedTheme(): ThemeTokens {
  try {
    const raw = localStorage.getItem(KEYS.theme)
    if (!raw) return DefaultThemes.dark
    const parsed = JSON.parse(raw) as Partial<ThemeTokens>
    const base = parsed.mode === 'dark' ? DefaultThemes.dark : DefaultThemes.light
    return { ...base, ...parsed, mode: parsed.mode === 'dark' ? 'dark' : 'light' }
  } catch {
    return DefaultThemes.dark
  }
}

export function saveTheme(theme: ThemeTokens) {
  try {
    localStorage.setItem(KEYS.theme, JSON.stringify(theme))
  } catch {
    /* ignore quota */
  }
}

export function loadSessionIds(): {
  projectId?: string
  workspaceId?: string
  pageId?: string
} {
  try {
    return {
      projectId: localStorage.getItem(KEYS.projectId) || undefined,
      workspaceId: localStorage.getItem(KEYS.workspaceId) || undefined,
      pageId: localStorage.getItem(KEYS.pageId) || undefined,
    }
  } catch {
    return {}
  }
}

function pageOrderKey(projectId: string, workspaceId: string) {
  return `ai-ui-builder:pageOrder:${projectId}:${workspaceId}`
}

export function loadPageOrder(projectId: string, workspaceId: string): string[] | null {
  try {
    const raw = localStorage.getItem(pageOrderKey(projectId, workspaceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null
  } catch {
    return null
  }
}

export function savePageOrder(projectId: string, workspaceId: string, pageIds: string[]) {
  try {
    localStorage.setItem(pageOrderKey(projectId, workspaceId), JSON.stringify(pageIds))
  } catch {
    /* ignore quota */
  }
}

export function saveSessionIds(projectId: string, workspaceId?: string, pageId?: string) {
  try {
    localStorage.setItem(KEYS.projectId, projectId)
    if (workspaceId) localStorage.setItem(KEYS.workspaceId, workspaceId)
    if (pageId) localStorage.setItem(KEYS.pageId, pageId)
  } catch {
    /* ignore */
  }
}
