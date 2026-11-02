import { useState, type CSSProperties } from 'react'
import { Menu, X } from 'lucide-react'

type Notify = (message: string) => void

function asLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return ['الرئيسية', 'حول', 'تواصل']
  return value.map((v) => String(v))
}

export function SidebarMenu({
  props,
  boxStyle,
  onNotify,
}: {
  props: Record<string, unknown>
  boxStyle?: CSSProperties
  onNotify?: Notify
}) {
  const links = asLinks(props.links)
  const collapsed = Boolean(props.collapsed)

  return (
    <aside
      className={`ui-sidebar ${collapsed ? 'is-collapsed' : ''}`}
      style={boxStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ui-sidebar-brand">
        <span className="ui-sidebar-mark">{String(props.brand ?? 'App').slice(0, 1)}</span>
        {!collapsed && <strong>{String(props.brand ?? 'القائمة')}</strong>}
      </div>
      <nav className="ui-sidebar-nav">
        {links.map((link) => (
          <button
            key={link}
            type="button"
            className="ui-sidebar-link"
            onClick={() => onNotify?.(`سايدبار: ${link}`)}
          >
            <span className="ui-sidebar-dot" />
            {!collapsed && <span>{link}</span>}
          </button>
        ))}
      </nav>
      {!collapsed && String(props.footerNote ?? '') && (
        <small className="ui-sidebar-note">{String(props.footerNote)}</small>
      )}
    </aside>
  )
}

export function BurgerMenu({
  props,
  boxStyle,
  onNotify,
}: {
  props: Record<string, unknown>
  boxStyle?: CSSProperties
  onNotify?: Notify
}) {
  const links = asLinks(props.links)
  const [open, setOpen] = useState(Boolean(props.defaultOpen))

  return (
    <div className="ui-burger-wrap" style={boxStyle} onClick={(e) => e.stopPropagation()}>
      <div className="ui-burger-bar">
        <button
          type="button"
          className="ui-burger-btn"
          aria-label="فتح القائمة"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <strong>{String(props.brand ?? 'علامتي')}</strong>
        {props.showCta !== false && (
          <button
            type="button"
            className="ui-btn"
            onClick={() => onNotify?.(String(props.ctaLabel ?? 'ابدأ'))}
          >
            {String(props.ctaLabel ?? 'ابدأ')}
          </button>
        )}
      </div>

      {open && <div className="ui-burger-backdrop" onClick={() => setOpen(false)} />}

      <aside className={`ui-burger-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="ui-burger-drawer-head">
          <strong>{String(props.drawerTitle ?? 'القائمة')}</strong>
          <button type="button" className="ui-burger-btn" onClick={() => setOpen(false)} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <nav>
          {links.map((link) => (
            <button
              key={link}
              type="button"
              className="ui-burger-link"
              onClick={() => {
                onNotify?.(`بيرجر: ${link}`)
                setOpen(false)
              }}
            >
              {link}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  )
}
