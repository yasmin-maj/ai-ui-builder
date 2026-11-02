import type { CatalogItem, ChatResponse, ProjectState, ThemeTokens, UiPage } from './types'

const BASE = ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),
  createProject: () => request<ProjectState>('/api/projects', { method: 'POST' }),
  getProject: (id: string) => request<ProjectState>(`/api/projects/${id}`),
  chat: (body: {
    projectId?: string
    message: string
    currentPage?: UiPage
    workspaceId?: string
    pageId?: string
  }) => request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(body) }),
  updatePage: (id: string, page: UiPage, workspaceId?: string) =>
    request<ProjectState>(`/api/projects/${id}/page`, {
      method: 'PUT',
      body: JSON.stringify({ page, workspaceId }),
    }),
  updateTheme: (id: string, theme: ThemeTokens, workspaceId?: string, pageId?: string) =>
    request<ProjectState>(`/api/projects/${id}/theme`, {
      method: 'PUT',
      body: JSON.stringify({ theme, workspaceId, pageId }),
    }),
  addWorkspace: (id: string, name?: string) =>
    request<ProjectState>(`/api/projects/${id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  renameWorkspace: (id: string, wsId: string, name: string) =>
    request<ProjectState>(`/api/projects/${id}/workspaces/${wsId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),
  deleteWorkspace: (id: string, wsId: string) =>
    request<ProjectState>(`/api/projects/${id}/workspaces/${wsId}`, { method: 'DELETE' }),
  renamePage: (id: string, wsId: string, pageId: string, title: string) =>
    request<ProjectState>(`/api/projects/${id}/workspaces/${wsId}/pages/${pageId}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),
  deletePage: (id: string, wsId: string, pageId: string) =>
    request<ProjectState>(`/api/projects/${id}/workspaces/${wsId}/pages/${pageId}`, {
      method: 'DELETE',
    }),
  reorderPages: (id: string, wsId: string, pageIds: string[]) =>
    request<ProjectState>(`/api/projects/${id}/workspaces/${wsId}/page-order`, {
      method: 'PUT',
      body: JSON.stringify({ pageIds }),
    }),
  setActive: (id: string, workspaceId?: string, pageId?: string) =>
    request<ProjectState>(`/api/projects/${id}/active`, {
      method: 'PUT',
      body: JSON.stringify({ workspaceId, pageId }),
    }),
  addPage: (id: string, title?: string, workspaceId?: string) =>
    request<ProjectState>(`/api/projects/${id}/pages`, {
      method: 'POST',
      body: JSON.stringify({ title, workspaceId }),
    }),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ url: string; name: string; size: number }>('/api/uploads', {
      method: 'POST',
      body: form,
    })
  },
  catalog: () => request<CatalogItem[]>('/api/components/catalog'),
  searchUsers: (q: string) =>
    request<{ query: string; results: DemoUser[] }>(`/api/demo/users?q=${encodeURIComponent(q)}`),
  getOptions: (q = '') =>
    request<DemoOption[]>(`/api/demo/options${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getStats: () => request<DemoStat[]>('/api/demo/stats'),
  getChart: () => request<DemoChart>('/api/demo/chart'),
  fetchJson: (url: string) => {
    const path = url.trim()
    if (path.startsWith('/')) return request<unknown>(path)
    return fetch(path).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<unknown>
    })
  },
  saveSelect: (body: { kind: string; values: string[]; label?: string; componentId?: string }) =>
    request<{ ok: boolean; message: string }>('/api/demo/select', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recentEvents: () => request<unknown[]>('/api/demo/events'),
}

export type DemoUser = {
  id: string
  name: string
  role: string
  city: string
  bio: string
  tags: string[]
}

export type DemoOption = {
  value: string
  label: string
}

export type DemoStat = {
  label: string
  value: string
  hint: string
}

export type DemoChart = {
  title: string
  unit: string
  points: Array<{ label: string; value: number }>
}
