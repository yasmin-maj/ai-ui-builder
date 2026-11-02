export type ThemeTokens = {
  mode: 'light' | 'dark' | string
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  border: string
  radius: string
  fontFamily: string
}

export type UiAction = {
  id: string
  type: 'navigate' | 'alert' | 'scroll' | 'custom' | string
  label: string
  target?: string | null
  payload?: string | null
}

export type UiComponent = {
  id: string
  type: string
  props: Record<string, unknown>
  actions?: UiAction[]
  children?: UiComponent[]
}

export type UiPage = {
  id: string
  title: string
  description: string
  theme: ThemeTokens
  components: UiComponent[]
}

export type ChatMessage = {
  role: 'user' | 'assistant' | string
  content: string
  at: string
}

export type Workspace = {
  id: string
  name: string
  pages: UiPage[]
  activePageId: string
  messages: ChatMessage[]
}

export type ProjectState = {
  id: string
  name: string
  workspaces: Workspace[]
  activeWorkspaceId: string
  page: UiPage
  updatedAt: string
}

export type ChatResponse = {
  projectId: string
  reply: string
  page: UiPage
  messages: ChatMessage[]
  project: ProjectState
}

export type CatalogItem = {
  type: string
  label: string
  description: string
}
