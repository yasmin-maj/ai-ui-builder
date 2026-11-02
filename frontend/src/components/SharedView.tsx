import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { UiAction, UiComponent, UiPage, Workspace } from '../types'
import { PreviewRenderer } from './PreviewRenderer'

type Props = {
  page: UiPage
  projectId: string
  workspace?: Workspace | null
  onNotify?: (message: string) => void
}

export function SharedView({ page, projectId, workspace, onNotify }: Props) {
  const incoming = workspace?.pages?.length ? workspace.pages : [page]
  const [pages, setPages] = useState<UiPage[]>(incoming)
  const [pageId, setPageId] = useState(workspace?.activePageId ?? page.id)

  useEffect(() => {
    setPages(incoming)
    setPageId(workspace?.activePageId ?? page.id)
  }, [projectId, workspace?.activePageId, page.id, incoming.length])

  const current = useMemo(
    () => pages.find((p) => p.id === pageId) ?? pages[0] ?? page,
    [pages, pageId, page],
  )

  const onChangeComponent = (next: UiComponent) => {
    setPages((list) =>
      list.map((p) =>
        p.id === current.id
          ? { ...p, components: p.components.map((c) => (c.id === next.id ? next : c)) }
          : p,
      ),
    )
  }

  const onAction = (action: UiAction) => {
    if (action.type === 'navigate' && (action.target === 'next-page' || action.payload === 'next-page')) {
      const index = pages.findIndex((p) => p.id === current.id)
      const next = index >= 0 ? pages[index + 1] : undefined
      if (next) {
        setPageId(next.id)
        onNotify?.(`فتح: ${next.title}`)
      } else {
        onNotify?.('ما في صفحة بعدها')
      }
      return
    }
    if (action.type === 'navigate' && action.target) {
      const hit = pages.find((p) => p.id === action.target)
      if (hit) {
        setPageId(hit.id)
        onNotify?.(`فتح: ${hit.title}`)
        return
      }
      if (action.target.startsWith('#')) {
        document.querySelector(action.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    if (action.type === 'alert' || action.type === 'custom') {
      onNotify?.(action.payload || action.label)
    }
  }

  return (
    <div className="shared-shell">
      <header className="shared-bar">
        <div>
          <strong>{current.title || 'صفحة مشتركة'}</strong>
          <span>مشاركة عامة · Project {projectId}</span>
        </div>
        {pages.length > 1 && (
          <div className="shared-pages">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ws-tab page ${p.id === current.id ? 'active' : ''}`}
                onClick={() => setPageId(p.id)}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}
        <a className="ghost-btn" href="/">
          <ExternalLink size={16} />
          افتح الـ Builder
        </a>
      </header>
      <div className="shared-scroll">
        <PreviewRenderer
          page={current}
          onAction={onAction}
          onNotify={onNotify}
          onChangeComponent={onChangeComponent}
        />
      </div>
    </div>
  )
}
