import { useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'
import type { UiAction, UiComponent } from '../types'
import { createDefaultComponent } from './EditorPanel'
import { ImageUploadSlot } from './ImageUploadSlot'

const PALETTE: Array<{ type: string; label: string }> = [
  { type: 'navbar', label: 'شريط تنقل' },
  { type: 'sidebar', label: 'سايدبار' },
  { type: 'burgermenu', label: 'بيرجر' },
  { type: 'hero', label: 'هيرو' },
  { type: 'features', label: 'مميزات' },
  { type: 'cards', label: 'كروت' },
  { type: 'stats', label: 'إحصائيات' },
  { type: 'form', label: 'نموذج' },
  { type: 'login', label: 'تسجيل دخول' },
  { type: 'profile', label: 'بروفايل' },
  { type: 'feed', label: 'فيد' },
  { type: 'cta', label: 'دعوة' },
  { type: 'footer', label: 'فوتر' },
  { type: 'text', label: 'نص' },
  { type: 'button', label: 'زر' },
  { type: 'image', label: 'صورة' },
  { type: 'stack', label: 'بطاقة' },
  { type: 'search', label: 'بحث' },
  { type: 'select', label: 'اختيار واحد' },
  { type: 'multiselect', label: 'اختيار متعدد' },
  { type: 'dropdown', label: 'دروب داون' },
  { type: 'usercard', label: 'يوزر كارد' },
  { type: 'colorpicker', label: 'Color picker' },
  { type: 'datepicker', label: 'Date picker' },
  { type: 'timepicker', label: 'Time picker' },
  { type: 'chart', label: 'Chart' },
]

type CellItem = {
  id: string
  kind: 'text' | 'image' | 'button' | 'component'
  text?: string
  label?: string
  src?: string
  alt?: string
  caption?: string
  component?: UiComponent
}

type SectionCell = {
  items: CellItem[]
  width?: number
  minHeight?: number
}

type Props = {
  props: Record<string, unknown>
  boxStyle?: CSSProperties
  onNotify?: (message: string) => void
  onChangeProps?: (next: Record<string, unknown>) => void
  onAction?: (action: UiAction) => void
  renderNested?: (component: UiComponent, onChange: (next: UiComponent) => void) => ReactNode
}

function newId() {
  return `it-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeItem(raw: unknown): CellItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (item.kind === 'component' && item.component && typeof item.component === 'object') {
    const component = item.component as UiComponent
    return {
      id: String(item.id ?? component.id ?? newId()),
      kind: 'component',
      component,
    }
  }
  const kind = String(item.kind ?? '')
  if (kind === 'image') {
    return {
      id: String(item.id ?? newId()),
      kind: 'image',
      src: String(item.src ?? ''),
      alt: String(item.alt ?? 'صورة'),
      caption: String(item.caption ?? ''),
    }
  }
  if (kind === 'button') {
    return {
      id: String(item.id ?? newId()),
      kind: 'button',
      label: String(item.label ?? 'زر'),
    }
  }
  if (kind === 'text' || kind === 'heading') {
    const text = [item.title, item.text].filter((v) => typeof v === 'string' && v.trim()).join('\n')
    return {
      id: String(item.id ?? newId()),
      kind: 'text',
      text,
    }
  }
  return null
}

function normalizeCell(raw: unknown): SectionCell {
  if (raw && typeof raw === 'object') {
    const cell = raw as Record<string, unknown>
    const width = Number(cell.width)
    const minHeight = Number(cell.minHeight)
    const size = {
      ...(Number.isFinite(width) && width > 0 ? { width } : {}),
      ...(Number.isFinite(minHeight) && minHeight > 0 ? { minHeight } : {}),
    }
    if (Array.isArray(cell.items)) {
      return { items: cell.items.map(normalizeItem).filter((x): x is CellItem => Boolean(x)), ...size }
    }
    const single = normalizeItem(cell)
    if (single && String(cell.kind ?? '') !== 'empty') return { items: [single], ...size }
    return { items: [], ...size }
  }
  return { items: [] }
}

function asCells(value: unknown, count: number): SectionCell[] {
  const raw = Array.isArray(value) ? value : []
  const cells = raw.map(normalizeCell)
  while (cells.length < count) cells.push({ items: [] })
  return cells.slice(0, count)
}

function canTakeComponent(e: DragEvent) {
  const types = Array.from(e.dataTransfer.types)
  return types.includes('application/x-ui-type') || types.includes('text/plain')
}

export function SectionsGrid({ props, boxStyle, onNotify, onChangeProps, onAction, renderNested }: Props) {
  const count = Math.min(12, Math.max(1, Number(props.count ?? props.columns ?? 2) || 2))
  const cells = asCells(props.cells, count)
  const [menu, setMenu] = useState<{ index: number; top: number; left: number } | null>(null)
  const [dropOver, setDropOver] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ index: number; width?: number; minHeight?: number } | null>(null)

  const commit = (next: SectionCell[], nextCount = count) => {
    onChangeProps?.({
      ...props,
      count: nextCount,
      cells: next,
    })
  }

  const addComponent = (cellIndex: number, type: string) => {
    const created = createDefaultComponent(type, newId())
    const item: CellItem = { id: created.id, kind: 'component', component: created }
    const next = cells.map((cell, i) => (i === cellIndex ? { ...cell, items: [...cell.items, item] } : cell))
    commit(next)
    setMenu(null)
  }

  const openMenu = (index: number, anchor: HTMLElement) => {
    if (menu?.index === index) {
      setMenu(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const width = 220
    const height = 280
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const below = rect.bottom + 6
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
    setMenu({ index, top, left })
  }

  const patchItem = (cellIndex: number, itemId: string, patch: Partial<CellItem>) => {
    const next = cells.map((cell, i) =>
      i === cellIndex
        ? { ...cell, items: cell.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
        : cell,
    )
    commit(next)
  }

  const removeItem = (cellIndex: number, itemId: string) => {
    const next = cells.map((cell, i) =>
      i === cellIndex ? { ...cell, items: cell.items.filter((item) => item.id !== itemId) } : cell,
    )
    commit(next)
  }

  const startSize = (e: ReactPointerEvent, cellIndex: number, axis: 'x' | 'y', side: 'left' | 'right' = 'right') => {
    if (!onChangeProps) return
    e.preventDefault()
    e.stopPropagation()
    const el = (e.currentTarget as HTMLElement).closest('.ui-section-cell') as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startW = rect.width
    const startH = rect.height
    const cell = cells[cellIndex]
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const width =
        axis === 'y' ? cell?.width : Math.max(140, Math.round(side === 'right' ? startW + dx : startW - dx))
      const minHeight = axis === 'x' ? cell?.minHeight : Math.max(90, Math.round(startH + (ev.clientY - startY)))
      setDraft({ index: cellIndex, width, minHeight })
    }
    const onUp = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const width =
        axis === 'y' ? cell?.width : Math.max(140, Math.round(side === 'right' ? startW + dx : startW - dx))
      const minHeight = axis === 'x' ? cell?.minHeight : Math.max(90, Math.round(startH + (ev.clientY - startY)))
      setDraft(null)
      const next = cells.map((entry, i) =>
        i === cellIndex
          ? {
              ...entry,
              ...(axis !== 'y' ? { width } : {}),
              ...(axis !== 'x' ? { minHeight } : {}),
            }
          : entry,
      )
      commit(next)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="ui-section ui-sections" style={boxStyle}>
      <div className="ui-sections-head">
        <h2>{String(props.title ?? 'أقسام')}</h2>
      </div>

      <div className="ui-sections-grid">
        {cells.map((cell, i) => {
          const width = draft?.index === i ? draft.width : cell.width
          const minHeight = draft?.index === i ? draft.minHeight : cell.minHeight
          return (
            <div
              key={i}
              className={`ui-section-cell ${dropOver === i ? 'is-drop' : ''}`}
              style={{
                ...(width ? { width, flex: `0 0 ${width}px` } : {}),
                ...(minHeight ? { minHeight } : {}),
              }}
              onDragOver={(e) => {
                if (!canTakeComponent(e)) return
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
                setDropOver(i)
              }}
              onDragLeave={() => setDropOver((current) => (current === i ? null : current))}
              onDrop={(e) => {
                if (!canTakeComponent(e)) return
                e.preventDefault()
                e.stopPropagation()
                const type = e.dataTransfer.getData('application/x-ui-type') || e.dataTransfer.getData('text/plain')
                setDropOver(null)
                if (!type || type.includes(' ')) return
                addComponent(i, type)
              }}
            >
              <div className="ui-section-cell-tools">
                <span>جزء {i + 1}</span>
                <div className="ui-cell-add">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openMenu(i, e.currentTarget)
                    }}
                  >
                    <Plus size={12} /> كمبوننت
                  </button>
                </div>
              </div>

              {cell.items.length === 0 && (
                <p className="ui-section-empty">اسحبي أي كمبوننت لهون، أو اضغطي «كمبوننت»</p>
              )}

              {cell.items.map((item) => (
                <div key={item.id} className="ui-cell-item" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="ui-cell-delete"
                    title="حذف"
                    onClick={() => removeItem(i, item.id)}
                  >
                    <Trash2 size={13} />
                  </button>

                  {item.kind === 'component' && item.component && (
                    renderNested ? (
                      renderNested(item.component, (next) => patchItem(i, item.id, { component: next }))
                    ) : (
                      <p className="ui-section-empty">{item.component.type}</p>
                    )
                  )}

                  {item.kind === 'text' && (
                    <textarea
                      value={item.text ?? ''}
                      placeholder="اكتبي أي نص…"
                      rows={3}
                      onChange={(e) => patchItem(i, item.id, { text: e.target.value })}
                    />
                  )}

                  {item.kind === 'image' && (
                    <ImageUploadSlot
                      src={item.src ?? ''}
                      alt={item.alt ?? 'صورة'}
                      caption={item.caption || 'اضغط لرفع صورة'}
                      onNotify={onNotify}
                      onUploaded={(url, name) =>
                        patchItem(i, item.id, { src: url, caption: item.caption || name })
                      }
                    />
                  )}

                  {item.kind === 'button' && (
                    <div className="ui-section-button-wrap">
                      <button
                        type="button"
                        className="ui-btn"
                        onClick={() => {
                          onNotify?.(item.label || 'زر')
                          onAction?.({
                            id: item.id,
                            type: 'alert',
                            label: item.label || 'زر',
                            payload: item.label || 'clicked',
                          })
                        }}
                      >
                        {item.label || 'زر'}
                      </button>
                      <input
                        value={item.label ?? ''}
                        placeholder="نص الزر"
                        onChange={(e) => patchItem(i, item.id, { label: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}

              {onChangeProps && (
                <>
                  <button
                    type="button"
                    className="cell-resize cell-resize-left"
                    aria-label="عرض من اليسار"
                    onPointerDown={(e) => startSize(e, i, 'x', 'left')}
                  />
                  <button
                    type="button"
                    className="cell-resize cell-resize-right"
                    aria-label="عرض من اليمين"
                    onPointerDown={(e) => startSize(e, i, 'x', 'right')}
                  />
                  <button
                    type="button"
                    className="cell-resize cell-resize-bottom"
                    aria-label="ارتفاع الجزء"
                    onPointerDown={(e) => startSize(e, i, 'y')}
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
      {menu &&
        createPortal(
          <div
            className="ui-cell-menu"
            style={{ top: menu.top, left: menu.left }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {PALETTE.map((entry) => (
              <button key={entry.type} type="button" onClick={() => addComponent(menu.index, entry.type)}>
                {entry.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
