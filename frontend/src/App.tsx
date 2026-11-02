import { Eye, Share2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { ChatPanel } from './components/ChatPanel'
import { EditorPanel, createDefaultComponent } from './components/EditorPanel'
import { FullPreview } from './components/FullPreview'
import { PreviewRenderer } from './components/PreviewRenderer'
import { SharedView } from './components/SharedView'
import { SpaceEditDock } from './components/SpaceEditDock'
import { useAskPrompt } from './components/NicePrompt'
import { ThemeQuickBar } from './components/ThemeQuickBar'
import { WorkspaceBar } from './components/WorkspaceBar'
import { loadPageOrder, loadSavedTheme, loadSessionIds, savePageOrder, saveSessionIds, saveTheme } from './persist'
import { applyDocumentShellTheme, shellThemeVars } from './shellTheme'
import { DefaultThemes } from './themeDefaults'
import type { CatalogItem, ChatMessage, ProjectState, ThemeTokens, UiAction, UiPage, Workspace } from './types'
import './App.css'

const savedThemeBoot = loadSavedTheme()

const emptyPage: UiPage = {
  id: 'page-1',
  title: 'صفحة جديدة',
  description: '',
  theme: savedThemeBoot,
  components: [],
}

function withTheme(project: ProjectState, theme: ThemeTokens): ProjectState {
  return {
    ...project,
    workspaces: project.workspaces.map((w) => ({
      ...w,
      pages: w.pages.map((pg) => ({ ...pg, theme })),
    })),
    page: { ...project.page, theme },
  }
}

function activateInProject(
  project: ProjectState,
  workspaceId?: string,
  pageId?: string,
): ProjectState {
  const wsId = workspaceId ?? project.activeWorkspaceId
  const ws = project.workspaces.find((w) => w.id === wsId) ?? project.workspaces[0]
  if (!ws) return project
  const activePageId =
    (pageId && ws.pages.some((p) => p.id === pageId) ? pageId : null) ??
    (ws.pages.some((p) => p.id === ws.activePageId) ? ws.activePageId : ws.pages[0]?.id)
  const pages = ws.pages
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0] ?? project.page
  return {
    ...project,
    activeWorkspaceId: ws.id,
    workspaces: project.workspaces.map((w) =>
      w.id === ws.id ? { ...w, activePageId: activePage.id } : w,
    ),
    page: activePage,
  }
}

function getShareIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('share')
}

function buildShareUrl(projectId: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('share', projectId)
  return url.toString()
}

function applySavedPageOrder(project: ProjectState): ProjectState {
  return {
    ...project,
    workspaces: project.workspaces.map((w) => {
      const ids = loadPageOrder(project.id, w.id)
      if (!ids?.length) return w
      const byId = new Map(w.pages.map((p) => [p.id, p]))
      const ordered: UiPage[] = []
      for (const id of ids) {
        const page = byId.get(id)
        if (!page) continue
        ordered.push(page)
        byId.delete(id)
      }
      for (const page of w.pages) {
        if (byId.has(page.id)) ordered.push(page)
      }
      return { ...w, pages: ordered }
    }),
  }
}

function activeWorkspace(project: ProjectState | null): Workspace | null {
  if (!project?.workspaces?.length) return null
  return project.workspaces.find((w) => w.id === project.activeWorkspaceId) ?? project.workspaces[0]
}

function activePageOf(ws: Workspace | null): UiPage {
  if (!ws?.pages?.length) return emptyPage
  return ws.pages.find((p) => p.id === ws.activePageId) ?? ws.pages[0]
}

export default function App() {
  const ask = useAskPrompt()
  const [shareMode] = useState(() => Boolean(getShareIdFromUrl()))
  const [project, setProject] = useState<ProjectState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'أهلاً! عندك مشروع فيه وورك سبيس. احكيلي شو بدك تبني هون — مثلاً لوجين ووراها داشبورد. أو أضيفي وورك سبيس من Add وسمّيه، وقولي «بالوورك سبيس الأولى…».',
      at: new Date().toISOString(),
    },
  ])
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [viewMode, setViewMode] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'phone'>('desktop')
  const [dropActive, setDropActive] = useState(false)
  const [shareLoading, setShareLoading] = useState(shareMode)
  const [shareError, setShareError] = useState<string | null>(null)

  const ws = useMemo(() => activeWorkspace(project), [project])
  const page = useMemo(() => activePageOf(ws), [ws])
  const projectId = project?.id

  const applyProject = (next: ProjectState) => {
    next = applySavedPageOrder(next)
    setProject(next)
    const active = activeWorkspace(next)
    if (active) {
      setMessages(active.messages)
      saveSessionIds(next.id, active.id, active.activePageId)
    } else {
      saveSessionIds(next.id)
    }
  }

  useEffect(() => {
    applyDocumentShellTheme(savedThemeBoot)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await api.health()
        setApiOk(true)
        const shareId = getShareIdFromUrl()
        if (shareId) {
          const loaded = await api.getProject(shareId)
          applyProject(withTheme(loaded, loadSavedTheme()))
          setShareLoading(false)
          return
        }

        const session = loadSessionIds()
        const theme = loadSavedTheme()
        const items = await api.catalog()
        setCatalog(items)

        let loaded: ProjectState | null = null
        if (session.projectId) {
          try {
            loaded = await api.getProject(session.projectId)
          } catch {
            loaded = null
          }
        }

        if (!loaded) {
          loaded = await api.createProject()
        }

        let next = withTheme(loaded, theme)
        next = activateInProject(next, session.workspaceId, session.pageId)
        // sync active selection to API when restoring
        try {
          next = await api.setActive(next.id, next.activeWorkspaceId, next.page.id)
          next = withTheme(next, theme)
        } catch {
          /* keep local activation */
        }
        applyProject(next)
      } catch (err) {
        setApiOk(false)
        if (shareMode) {
          setShareError(err instanceof Error ? err.message : 'ما قدرت أفتح الرابط المشترك')
          setShareLoading(false)
        }
        setCatalog([
          { type: 'image', label: 'صورة', description: '' },
          { type: 'hero', label: 'هيرو', description: '' },
          { type: 'login', label: 'لوجين', description: '' },
          { type: 'footer', label: 'فوتر', description: '' },
        ])
      }
    })()
  }, [shareMode])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    applyDocumentShellTheme(page.theme)
    saveTheme(page.theme)
  }, [page.theme])

  const showToast = (msg: string) => setToast(msg)

  const persistPage = async (next: UiPage) => {
    if (!project || !ws) {
      setProject((p) =>
        p
          ? {
              ...p,
              workspaces: p.workspaces.map((w) =>
                w.id === p.activeWorkspaceId
                  ? {
                      ...w,
                      pages: w.pages.map((pg) => (pg.id === next.id ? next : pg)),
                      activePageId: next.id,
                    }
                  : w,
              ),
            }
          : p,
      )
      return
    }
    setProject({
      ...project,
      workspaces: project.workspaces.map((w) =>
        w.id === ws.id
          ? {
              ...w,
              pages: w.pages.map((pg) => (pg.id === next.id ? next : pg)),
              activePageId: next.id,
            }
          : w,
      ),
      page: next,
    })
    try {
      const saved = await api.updatePage(project.id, next, ws.id)
      applyProject(saved)
    } catch {
      /* local edit still applies */
    }
  }

  /** Apply theme across all pages in the active workspace (app-wide look). */
  const persistTheme = async (theme: ThemeTokens) => {
    saveTheme(theme)
    applyDocumentShellTheme(theme)
    if (!project || !ws) {
      void persistPage({ ...page, theme })
      return
    }
    const pages = ws.pages.map((pg) => ({ ...pg, theme }))
    const nextPage = pages.find((p) => p.id === page.id) ?? { ...page, theme }
    const local: ProjectState = {
      ...project,
      workspaces: project.workspaces.map((w) =>
        w.id === ws.id ? { ...w, pages, activePageId: nextPage.id } : w,
      ),
      page: nextPage,
    }
    setProject(local)
    try {
      const saved = await api.updateTheme(project.id, theme, ws.id, nextPage.id)
      const synced: ProjectState = {
        ...saved,
        workspaces: saved.workspaces.map((w) =>
          w.id === ws.id
            ? { ...w, pages: w.pages.map((pg) => ({ ...pg, theme })) }
            : w,
        ),
      }
      await Promise.all(
        pages
          .filter((pg) => pg.id !== nextPage.id)
          .map((pg) => api.updatePage(project.id, pg, ws.id).catch(() => null)),
      )
      applyProject(synced)
      showToast(theme.mode === 'light' ? 'تم حفظ اللايت مود' : 'تم تحديث ثيم التطبيق')
    } catch {
      showToast('تم حفظ الثيم محلياً')
    }
  }

  const onSend = async (text: string) => {
    if (!project || !ws) return
    setBusy(true)
    try {
      const res = await api.chat({
        projectId: project.id,
        message: text,
        currentPage: page,
        workspaceId: ws.id,
        pageId: page.id,
      })
      applyProject(res.project)
      setSelectedId(null)
      showToast('تم تحديث الوورك سبيس')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل الطلب')
    } finally {
      setBusy(false)
    }
  }

  const flushActivePage = (base: ProjectState): ProjectState => {
    const activeWs = activeWorkspace(base)
    if (!activeWs) return base
    return {
      ...base,
      workspaces: base.workspaces.map((w) =>
        w.id === activeWs.id
          ? {
              ...w,
              pages: w.pages.map((pg) => (pg.id === page.id ? page : pg)),
              activePageId: page.id,
            }
          : w,
      ),
      page,
    }
  }

  const switchWorkspace = async (wsId: string) => {
    if (!project || wsId === project.activeWorkspaceId) return
    const flushed = flushActivePage(project)
    void api.updatePage(flushed.id, page, flushed.activeWorkspaceId).catch(() => null)
    const local = activateInProject(flushed, wsId)
    applyProject(local)
    setSelectedId(null)
    try {
      const next = await api.setActive(flushed.id, wsId, local.page.id)
      applyProject(withTheme(next, loadSavedTheme()))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل التبديل')
    }
  }

  const switchPage = async (pageId: string) => {
    if (!project || !ws || pageId === ws.activePageId) return
    const flushed = flushActivePage(project)
    void api.updatePage(flushed.id, page, ws.id).catch(() => null)
    const local = activateInProject(flushed, ws.id, pageId)
    applyProject(local)
    setSelectedId(null)
    try {
      const next = await api.setActive(flushed.id, ws.id, pageId)
      // keep current page content from local if API is behind
      const merged = activateInProject(
        {
          ...withTheme(next, loadSavedTheme()),
          workspaces: next.workspaces.map((w) => {
            const localWs = local.workspaces.find((x) => x.id === w.id)
            if (!localWs) return w
            return {
              ...w,
              pages: w.pages.map((pg) => localWs.pages.find((lp) => lp.id === pg.id) ?? pg),
              activePageId: localWs.activePageId,
            }
          }),
        },
        ws.id,
        pageId,
      )
      applyProject(merged)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل تبديل الصفحة')
    }
  }

  const addWorkspace = async () => {
    if (!project) return
    const name = await ask({
      title: 'وورك سبيس جديد',
      label: 'اختاري اسم للمساحة',
      defaultValue: `وورك سبيس ${project.workspaces.length + 1}`,
      placeholder: 'مثلاً: Auth Flow',
      confirmLabel: 'إضافة',
    })
    if (name === null) return
    setBusy(true)
    try {
      const next = await api.addWorkspace(project.id, name.trim() || undefined)
      applyProject(next)
      showToast('تم إضافة وورك سبيس')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل الإضافة')
    } finally {
      setBusy(false)
    }
  }

  const renameWorkspace = async (wsId: string, name: string) => {
    if (!project) return
    try {
      const next = await api.renameWorkspace(project.id, wsId, name)
      applyProject(next)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل التسمية')
    }
  }

  const deleteWorkspace = async (wsId: string) => {
    if (!project) return
    if (project.workspaces.length <= 1) {
      showToast('لازم يضل وورك سبيس واحد على الأقل')
      return
    }
    try {
      const next = await api.deleteWorkspace(project.id, wsId)
      applyProject(next)
      showToast('تم حذف الوورك سبيس')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل الحذف')
    }
  }

  const renamePage = async (pageId: string, title: string) => {
    if (!project || !ws) return
    try {
      const next = await api.renamePage(project.id, ws.id, pageId, title)
      applyProject(next)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل التسمية')
    }
  }

  const deletePage = async (pageId: string) => {
    if (!project || !ws) return
    try {
      const next = await api.deletePage(project.id, ws.id, pageId)
      applyProject(next)
      showToast('تم حذف الصفحة')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل الحذف')
    }
  }

  const reorderPages = (fromId: string, toId: string) => {
    if (!project || !ws || fromId === toId) return
    const pages = [...ws.pages]
    const from = pages.findIndex((p) => p.id === fromId)
    const to = pages.findIndex((p) => p.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = pages.splice(from, 1)
    pages.splice(to, 0, moved)
    const ids = pages.map((p) => p.id)
    savePageOrder(project.id, ws.id, ids)
    setProject({
      ...project,
      workspaces: project.workspaces.map((w) => (w.id === ws.id ? { ...w, pages } : w)),
    })
    void api.reorderPages(project.id, ws.id, ids).catch(() => {
      /* الترتيب محفوظ محلياً حتى لو السيرفر القديم ما فيه هالرابط */
    })
  }

  const addPage = async () => {
    if (!project || !ws) return
    const title = await ask({
      title: 'صفحة جديدة',
      label: 'اسم الصفحة',
      defaultValue: 'صفحة جديدة',
      placeholder: 'مثلاً: تسجيل الدخول',
      confirmLabel: 'إنشاء',
    })
    if (title === null) return
    setBusy(true)
    try {
      const next = await api.addPage(project.id, title.trim() || undefined, ws.id)
      applyProject(next)
      showToast('تم إضافة صفحة')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل إضافة الصفحة')
    } finally {
      setBusy(false)
    }
  }

  const dropComponent = async (type: string, index: number) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`
    let created = createDefaultComponent(type, id)
    if (type === 'sections') {
      const raw = await ask({
        title: 'أقسام / ديف',
        label: 'كم جزء بدك؟ (1–12)',
        defaultValue: '3',
        inputType: 'number',
        min: 1,
        max: 12,
        confirmLabel: 'إضافة',
      })
      if (raw === null) return
      const count = Math.min(12, Math.max(1, Number.parseInt(raw, 10) || 3))
      created = {
        ...created,
        props: {
          title: 'أقسام',
          count,
          cells: Array.from({ length: count }, () => ({ items: [] })),
        },
      }
    }
    const comps = [...page.components]
    const at = Math.min(Math.max(0, index), comps.length)
    comps.splice(at, 0, created)
    void persistPage({ ...page, components: comps })
    setSelectedId(id)
    showToast('تم إسقاط الكمبوننت')
  }

  const onAction = (action: UiAction) => {
    if (
      action.type === 'navigate' &&
      (action.target === 'next-page' || action.payload === 'next-page') &&
      project &&
      ws
    ) {
      const index = ws.pages.findIndex((p) => p.id === ws.activePageId)
      const next = index >= 0 ? ws.pages[index + 1] : undefined
      if (next) {
        void switchPage(next.id)
        showToast(`فتح: ${next.title}`)
      } else {
        showToast('ما في صفحة بعدها')
      }
      return
    }
    if (action.type === 'navigate' && action.payload === 'open-page' && action.target && project && ws) {
      const targetPage = ws.pages.find((p) => p.id === action.target)
      if (targetPage) {
        void switchPage(targetPage.id)
        showToast(`فتح: ${targetPage.title}`)
        return
      }
    }
    if (action.type === 'alert' || action.type === 'custom') {
      showToast(action.payload || action.label)
      return
    }
    if (action.type === 'scroll' || action.type === 'navigate') {
      const target = action.target || action.payload
      if (target?.startsWith('#')) {
        document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (action.target && project && ws?.pages.some((p) => p.id === action.target)) {
        void switchPage(action.target)
      } else {
        showToast(`Navigate: ${target ?? action.label}`)
      }
    }
  }

  const sharePage = async () => {
    if (!projectId) {
      showToast('ما في مشروع للمشاركة بعد')
      return
    }
    try {
      await api.updatePage(projectId, page, ws?.id)
      const link = buildShareUrl(projectId)
      await navigator.clipboard.writeText(link)
      showToast('تم نسخ لينك المشاركة')
    } catch {
      const link = projectId ? buildShareUrl(projectId) : ''
      if (link) {
        await ask({
          title: 'رابط المشاركة',
          label: 'انسخي الرابط من الصندوق',
          defaultValue: link,
          confirmLabel: 'تم',
          cancelLabel: 'إغلاق',
        })
      } else {
        showToast('فشل إنشاء رابط المشاركة')
      }
    }
  }

  if (shareMode) {
    if (shareLoading) {
      return (
        <div className="shared-shell shared-loading">
          <p>عم نحمّل الصفحة المشتركة…</p>
        </div>
      )
    }
    if (shareError || !projectId) {
      return (
        <div className="shared-shell shared-loading">
          <p>{shareError || 'الرابط غير صالح أو السيرفر مشغّل من جهاز ثاني/توقّف.'}</p>
          <a className="primary-btn" href="/">
            ارجع للـ Builder
          </a>
        </div>
      )
    }
    return (
      <>
        <SharedView page={page} projectId={projectId} workspace={ws} onNotify={showToast} />
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  return (
    <div className={`app-shell shell-${page.theme.mode === 'dark' ? 'dark' : 'light'}`} style={shellThemeVars(page.theme)}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">AI</span>
          <div>
            <strong>UI Builder</strong>
            <small>.NET + React · مشروع + وورك سبيس</small>
          </div>
        </div>
        <div className="topbar-meta">
          <span className={`status-dot ${apiOk ? 'ok' : apiOk === false ? 'bad' : ''}`} />
          <span>{apiOk ? `Project ${projectId}` : apiOk === false ? 'API offline' : 'connecting…'}</span>
          <span className="chip">{ws?.name ?? '—'}</span>
          <span className="chip">{page.title}</span>
          <button type="button" className="ghost-btn view-btn" onClick={() => void sharePage()} disabled={!projectId}>
            <Share2 size={16} />
            مشاركة
          </button>
          <button type="button" className="primary-btn view-btn" onClick={() => setViewMode(true)}>
            <Eye size={16} />
            معاينة الصفحة
          </button>
        </div>
      </header>

      <main className="workspace">
        <ChatPanel messages={messages} busy={busy} onSend={onSend} />

        <section className="space-panel">
          <div className="space-toolbar">
            <div className="space-toolbar-row">
              <div>
                <h1>Space</h1>
                <p>وورك سبيس متعددة لنفس المشروع · صفحات مترابطة (لوجين → داشبورد) · ارفع صور</p>
              </div>
              <div className="space-toolbar-actions">
                <button type="button" className="ghost-btn" onClick={() => void sharePage()} disabled={!projectId}>
                  <Share2 size={16} />
                  Share
                </button>
                <button type="button" className="ghost-btn" onClick={() => setViewMode(true)}>
                  <Eye size={16} />
                  View
                </button>
              </div>
            </div>
            <ThemeQuickBar theme={page.theme} onChange={(theme) => void persistTheme(theme)} />
            {project && (
              <WorkspaceBar
                project={project}
                busy={busy}
                onSwitchWorkspace={(id) => void switchWorkspace(id)}
                onAddWorkspace={() => void addWorkspace()}
                onRenameWorkspace={(id, name) => void renameWorkspace(id, name)}
                onDeleteWorkspace={(id) => void deleteWorkspace(id)}
                onSwitchPage={(id) => void switchPage(id)}
                onAddPage={() => void addPage()}
                onRenamePage={(id, title) => void renamePage(id, title)}
                onDeletePage={(id) => void deletePage(id)}
                onReorderPage={reorderPages}
              />
            )}
          </div>
          <div className="device-switch" role="group" aria-label="عرض الجهاز">
            {(
              [
                ['desktop', 'شاشة'],
                ['tablet', 'آيباد'],
                ['phone', 'تلفون'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={device === id ? 'active' : ''}
                onClick={() => setDevice(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className={`space-frame device-${device} ${dropActive ? 'is-drop-target' : ''}`}
            onClick={() => setSelectedId(null)}
            onDragOver={(e) => {
              const types = Array.from(e.dataTransfer.types)
              if (!types.includes('application/x-ui-type') && !types.includes('text/plain')) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDropActive(true)
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              const type =
                e.dataTransfer.getData('application/x-ui-type') || e.dataTransfer.getData('text/plain')
              setDropActive(false)
              if (!type || type.includes(' ')) return
              e.preventDefault()
              const blocks = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.preview-block'))
              let index = page.components.length
              for (let i = 0; i < blocks.length; i++) {
                const rect = blocks[i].getBoundingClientRect()
                if (e.clientY < rect.top + rect.height / 2) {
                  index = i
                  break
                }
              }
              void dropComponent(type, index)
            }}
          >
            <PreviewRenderer
              page={page}
              device={device}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={(id) => {
                void (async () => {
                  const ok = await ask({
                    title: 'تأكيد الحذف',
                    label: 'هل أنت متأكد من حذف هذا الكمبوننت؟',
                    confirmLabel: 'حذف',
                    cancelLabel: 'إلغاء',
                    confirm: true,
                  })
                  if (!ok) return
                  void persistPage({
                    ...page,
                    components: page.components.filter((c) => c.id !== id),
                  })
                  setSelectedId(null)
                  showToast('تم الحذف')
                })()
              }}
              onChangeComponent={(next) => {
                void persistPage({
                  ...page,
                  components: page.components.map((c) => (c.id === next.id ? next : c)),
                })
              }}
              onAction={onAction}
              onNotify={showToast}
            />
          </div>
          <SpaceEditDock
            page={page}
            selectedId={selectedId}
            catalog={catalog}
            onChangePage={(p) => void persistPage(p)}
            onSelect={setSelectedId}
            onNotify={showToast}
          />
        </section>

        <EditorPanel
          page={page}
          selectedId={selectedId}
          catalog={catalog}
          onChangePage={(p) => void persistPage(p)}
          onSelect={setSelectedId}
        />
      </main>

      {toast && <div className="toast">{toast}</div>}

      {viewMode && (
        <FullPreview
          page={page}
          device={device}
          onClose={() => setViewMode(false)}
          onAction={onAction}
          onNotify={showToast}
        />
      )}
    </div>
  )
}
