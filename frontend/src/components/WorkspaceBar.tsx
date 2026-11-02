import { FilePlus2, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ProjectState, UiPage, Workspace } from '../types'
import { useAskPrompt } from './NicePrompt'

type Props = {
  project: ProjectState
  busy?: boolean
  onSwitchWorkspace: (wsId: string) => void
  onAddWorkspace: () => void
  onRenameWorkspace: (wsId: string, name: string) => void
  onDeleteWorkspace: (wsId: string) => void
  onSwitchPage: (pageId: string) => void
  onAddPage: () => void
  onRenamePage: (pageId: string, title: string) => void
  onDeletePage: (pageId: string) => void
  onReorderPage: (fromId: string, toId: string) => void
}

export function WorkspaceBar({
  project,
  busy,
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onSwitchPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
  onReorderPage,
}: Props) {
  const ask = useAskPrompt()
  const [dropId, setDropId] = useState<string | null>(null)
  const draggedPage = useRef<string | null>(null)
  const skipClick = useRef(false)
  const active = project.workspaces.find((w) => w.id === project.activeWorkspaceId) ?? project.workspaces[0]

  const renameWorkspace = async (ws: Workspace) => {
    const next = await ask({
      title: 'إعادة تسمية',
      label: 'اسم الوورك سبيس',
      defaultValue: ws.name,
      confirmLabel: 'حفظ',
    })
    if (next && next.trim() && next.trim() !== ws.name) onRenameWorkspace(ws.id, next.trim())
  }

  const removeWorkspace = async (ws: Workspace) => {
    const ok = await ask({
      title: 'تأكيد الحذف',
      label: `هل أنت متأكد من حذف الوورك سبيس «${ws.name}» وكل صفحاته؟`,
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      confirm: true,
    })
    if (ok) onDeleteWorkspace(ws.id)
  }

  const renamePage = async (page: UiPage) => {
    const next = await ask({
      title: 'إعادة تسمية الصفحة',
      label: 'اسم الصفحة',
      defaultValue: page.title,
      confirmLabel: 'حفظ',
    })
    if (next && next.trim() && next.trim() !== page.title) onRenamePage(page.id, next.trim())
  }

  const removePage = async (page: UiPage) => {
    const ok = await ask({
      title: 'تأكيد الحذف',
      label: `هل أنت متأكد من حذف الصفحة «${page.title || 'الصفحة'}»؟`,
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      confirm: true,
    })
    if (ok) onDeletePage(page.id)
  }

  return (
    <div className="ws-bar">
      <div className="ws-row">
        <span className="ws-label">
          <Layers size={14} />
          وورك سبيس
        </span>
        <div className="ws-tabs">
          {project.workspaces.map((ws) => (
            <div key={ws.id} className={`ws-tab ${ws.id === active?.id ? 'active' : ''}`}>
              <button
                type="button"
                className="ws-tab-name"
                disabled={busy}
                onClick={() => onSwitchWorkspace(ws.id)}
              >
                {ws.name}
              </button>
              <button type="button" className="ws-icon" title="تعديل الاسم" onClick={() => void renameWorkspace(ws)}>
                <Pencil size={12} />
              </button>
              <button type="button" className="ws-icon danger" title="حذف" onClick={() => void removeWorkspace(ws)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="ws-add" disabled={busy} onClick={onAddWorkspace} title="إضافة وورك سبيس">
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {active && (
        <div className="ws-row pages">
          <span className="ws-label">صفحات</span>
          <div className="ws-tabs">
            {active.pages.map((p) => (
              <div
                key={p.id}
                className={`ws-tab page ${p.id === active.activePageId ? 'active' : ''} ${dropId === p.id ? 'drop-target' : ''}`}
                onDragOver={(e) => {
                  if (!draggedPage.current || draggedPage.current === p.id) return
                  e.preventDefault()
                  setDropId(p.id)
                }}
                onDragLeave={() => setDropId((id) => (id === p.id ? null : id))}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = draggedPage.current || e.dataTransfer.getData('text/page-id')
                  setDropId(null)
                  draggedPage.current = null
                  if (from && from !== p.id) onReorderPage(from, p.id)
                }}
              >
                <button
                  type="button"
                  className="ws-tab-name"
                  draggable
                  title="اسحب لتبديل مكان الصفحة"
                  onDragStart={(e) => {
                    draggedPage.current = p.id
                    skipClick.current = true
                    e.dataTransfer.setData('text/page-id', p.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    draggedPage.current = null
                    setDropId(null)
                    window.setTimeout(() => {
                      skipClick.current = false
                    }, 0)
                  }}
                  onClick={() => {
                    if (skipClick.current) return
                    onSwitchPage(p.id)
                  }}
                >
                  {p.title || p.id}
                </button>
                <button type="button" className="ws-icon" title="تعديل الاسم" onClick={() => void renamePage(p)}>
                  <Pencil size={12} />
                </button>
                <button type="button" className="ws-icon danger" title="حذف" onClick={() => void removePage(p)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="ws-add" disabled={busy} onClick={onAddPage} title="صفحة جديدة">
              <FilePlus2 size={14} />
              صفحة
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
