import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { ThemeTokens, UiAction, UiComponent, UiPage } from '../types'
import { ImageUploadSlot } from './ImageUploadSlot'
import { ChartBlock, PickerBlock, SearchBlock, SelectBlock, StatsBlock, UserCardBlock } from './InteractiveBlocks'
import { BurgerMenu, SidebarMenu } from './NavMenus'
import { SectionsGrid } from './SectionsGrid'

export type PreviewDevice = 'desktop' | 'tablet' | 'phone'

type Props = {
  page: UiPage
  device?: PreviewDevice
  selectedId?: string | null
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
  onAction?: (action: UiAction) => void
  onNotify?: (message: string) => void
  onChangeComponent?: (next: UiComponent) => void
}

function widthKey(device: PreviewDevice) {
  if (device === 'phone') return 'maxWidthPhone'
  if (device === 'tablet') return 'maxWidthTablet'
  return 'maxWidth'
}

function themeVars(theme: ThemeTokens): CSSProperties {
  return {
    ['--p' as string]: theme.primary,
    ['--s' as string]: theme.secondary,
    ['--a' as string]: theme.accent,
    ['--bg' as string]: theme.background,
    ['--sf' as string]: theme.surface,
    ['--tx' as string]: theme.text,
    ['--mu' as string]: theme.muted,
    ['--bd' as string]: theme.border,
    ['--rd' as string]: theme.radius,
    background: theme.background,
    color: theme.text,
    fontFamily: theme.fontFamily,
    minHeight: '100%',
    direction: 'rtl',
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function cssLength(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (/^\d+(\.\d+)?$/.test(v)) return `${v}px`
  return v
}

function normalizeStackItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return item as Record<string, unknown>
    }
    return { kind: 'text', text: String(item ?? '') }
  })
}

export function PreviewRenderer({
  page,
  device = 'desktop',
  selectedId,
  onSelect,
  onDelete,
  onAction,
  onNotify,
  onChangeComponent,
}: Props) {
  const [liveSize, setLiveSize] = useState<{
    id: string
    height?: number
    width?: number
    offset?: number
  } | null>(null)
  const [liveMove, setLiveMove] = useState<{ id: string; x: number; y: number } | null>(null)
  if (page.components.length === 0) {
    return (
      <div className="preview-root preview-empty" style={themeVars(page.theme)}>
        <p>الـ Space فاضي</p>
        <span>احكي للشات أو أضف كمبوننت من الشريط تحت</span>
      </div>
    )
  }

  return (
    <div
      className="preview-root"
      style={{
        ...themeVars(page.theme),
        ['--row-gap' as string]:
          [...page.components].reverse().map((item) => cssLength(asString(item.props.rowGap, ''))).find(Boolean) ||
          '12px',
        gap: 'var(--row-gap)',
      }}
    >
      {page.components.map((c) => {
        const sectionSize = asString(c.props.sectionSize, 'md')
        const live = liveSize?.id === c.id ? liveSize : null
        const sectionHeight = live?.height ? `${live.height}px` : cssLength(asString(c.props.minHeight, ''))
        const storedWidth = asString(c.props[widthKey(device)], '').trim()
        const widthRaw = live?.width
          ? `${live.width}px`
          : storedWidth || (device === 'desktop' ? '' : asString(c.props.maxWidth, '').trim())
        const fillsRow = widthRaw === 'fill'
        const maxWidth = fillsRow ? '' : cssLength(widthRaw)
        const blockOffset =
          live?.offset != null
            ? `${Math.max(0, live.offset)}px`
            : cssLength(asString(c.props.blockOffset, ''))
        const boxStyle: CSSProperties = {
          ...(sectionHeight ? { height: '100%', minHeight: '100%' } : {}),
        }
        const startResize = (e: ReactPointerEvent, axis: 'h' | 'w' | 'both', side: 'left' | 'right' = 'right') => {
          if (!onChangeComponent) return
          e.preventDefault()
          e.stopPropagation()
          const block = (e.currentTarget as HTMLElement).closest('.preview-block') as HTMLElement | null
          const parent = block?.parentElement
          if (!block || !parent) return
          const rect = block.getBoundingClientRect()
          const parentRect = parent.getBoundingClientRect()
          const startX = e.clientX
          const startY = e.clientY
          const startH = rect.height
          const startW = rect.width
          const startOffset = rect.left - parentRect.left
          const measure = (ev: PointerEvent) => {
            const height = Math.max(56, Math.round(startH + (ev.clientY - startY)))
            const dx = ev.clientX - startX
            let width = startW
            let offset = startOffset
            if (axis !== 'h') {
              if (side === 'right') {
                width = Math.max(180, Math.round(startW + dx))
              } else {
                width = Math.max(180, Math.round(startW - dx))
                offset = Math.max(0, Math.round(startOffset + (startW - width)))
              }
            }
            return { height, width, offset }
          }
          const onMove = (ev: PointerEvent) => {
            const next = measure(ev)
            setLiveSize({
              id: c.id,
              height: axis === 'w' ? undefined : next.height,
              width: axis === 'h' ? undefined : next.width,
              offset: axis === 'h' ? undefined : next.offset,
            })
          }
          const onUp = (ev: PointerEvent) => {
            const next = measure(ev)
            setLiveSize(null)
            onChangeComponent({
              ...c,
              props: {
                ...c.props,
                ...(axis !== 'w' ? { minHeight: `${next.height}px` } : {}),
                ...(axis !== 'h'
                  ? { [widthKey(device)]: `${next.width}px`, blockOffset: `${next.offset}px` }
                  : {}),
              },
            })
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }
        const marginTop = cssLength(asString(c.props.marginTop, ''))
        const marginBottom = cssLength(asString(c.props.marginBottom, ''))
        const marginInline = cssLength(asString(c.props.marginInline, ''))
        const padding = cssLength(asString(c.props.padding, ''))
        const paddingTop = cssLength(asString(c.props.paddingTop, ''))
        const paddingBottom = cssLength(asString(c.props.paddingBottom, ''))
        const paddingInline = cssLength(asString(c.props.paddingInline, ''))
        const radius = cssLength(asString(c.props.radius, ''))
        const moved = liveMove?.id === c.id ? liveMove : null
        const moveX = moved ? moved.x : asNumber(c.props.moveX)
        const moveY = moved ? moved.y : asNumber(c.props.moveY)
        const startMove = (e: ReactPointerEvent) => {
          if (!onChangeComponent) return
          const target = e.target as HTMLElement
          const fromDelete = Boolean(target.closest('.preview-delete-btn'))
          if (!fromDelete && target.closest('button, input, textarea, select, a, .resize-handle, .cell-resize')) return
          e.stopPropagation()
          const originX = asNumber(c.props.moveX)
          const originY = asNumber(c.props.moveY)
          const startX = e.clientX
          const startY = e.clientY
          let dragged = false
          const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX
            const dy = ev.clientY - startY
            if (!dragged && Math.hypot(dx, dy) < 4) return
            dragged = true
            setLiveMove({
              id: c.id,
              x: Math.round(originX + dx),
              y: Math.round(originY + dy),
            })
          }
          const onUp = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            if (!dragged) return
            setLiveMove(null)
            onChangeComponent({
              ...c,
              props: {
                ...c.props,
                moveX: Math.round(originX + (ev.clientX - startX)),
                moveY: Math.round(originY + (ev.clientY - startY)),
              },
            })
            const swallow = (clickEv: MouseEvent) => {
              clickEv.preventDefault()
              clickEv.stopPropagation()
            }
            window.addEventListener('click', swallow, true)
            window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }
        return (
          <section
            key={c.id}
            id={c.type === 'hero' ? 'hero' : c.id}
            className={`preview-block size-${sectionSize} ${sectionHeight ? 'has-fixed-height' : ''} ${selectedId === c.id ? 'is-selected' : ''} ${radius ? 'has-radius' : ''} ${moved ? 'is-moving' : ''}`}
            data-type={c.type}
            style={{
              ...(moveX || moveY ? { transform: `translate(${moveX}px, ${moveY}px)`, zIndex: moved ? 8 : 2 } : {}),
              ...(sectionHeight ? { height: sectionHeight, minHeight: sectionHeight } : {}),
              ...(marginTop ? { marginTop } : {}),
              ...(marginBottom ? { marginBottom } : {}),
              ...(fillsRow
                ? {
                    flex: '1 1 0',
                    width: 'auto',
                    maxWidth: 'none',
                    minWidth: 0,
                    boxSizing: 'border-box' as const,
                    alignSelf: 'flex-start',
                    ...(marginInline ? { marginInline } : {}),
                  }
                : maxWidth === '100%'
                  ? {
                      flex: '0 0 100%',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box' as const,
                      ...(marginInline ? { marginInline } : {}),
                    }
                  : maxWidth
                    ? {
                        flex: `1 1 calc(${maxWidth} - var(--row-gap, 0px))`,
                        width: 'auto',
                        maxWidth: `calc(${maxWidth} - var(--row-gap, 0px))`,
                        minWidth: 0,
                        boxSizing: 'border-box' as const,
                        alignSelf: 'flex-start',
                        ...(blockOffset
                          ? {
                              marginLeft: marginInline ? `calc(${blockOffset} + ${marginInline})` : blockOffset,
                              marginRight: marginInline || '0',
                            }
                          : marginInline
                            ? { marginInline }
                            : {}),
                      }
                  : marginInline
                    ? { marginInline }
                    : {}),
              ...(padding ? { padding } : {}),
              ...(paddingTop ? { paddingTop } : {}),
              ...(paddingBottom ? { paddingBottom } : {}),
              ...(paddingInline ? { paddingInline } : {}),
              ...(radius
                ? ({
                    borderRadius: radius,
                    ['--rd' as string]: radius,
                    ['--block-rd' as string]: radius,
                  } as CSSProperties)
                : {}),
            }}
            onPointerDown={selectedId === c.id ? startMove : undefined}
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(c.id)
            }}
          >
            {selectedId === c.id && (
              <div
                className="preview-block-tools"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={startMove}
              >
                <span>{c.type}</span>
                <button
                  type="button"
                  className="preview-delete-btn"
                  onClick={() => onDelete?.(c.id)}
                >
                  حذف
                </button>
              </div>
            )}
            {selectedId === c.id && onChangeComponent && (
              <>
                <button
                  type="button"
                  className="resize-handle resize-h"
                  aria-label="تغيير الارتفاع"
                  onPointerDown={(e) => startResize(e, 'h')}
                />
                <button
                  type="button"
                  className="resize-handle resize-w resize-left"
                  aria-label="تغيير العرض من اليسار"
                  onPointerDown={(e) => startResize(e, 'w', 'left')}
                />
                <button
                  type="button"
                  className="resize-handle resize-w resize-right"
                  aria-label="تغيير العرض من اليمين"
                  onPointerDown={(e) => startResize(e, 'w', 'right')}
                />
                <button
                  type="button"
                  className="resize-handle resize-both"
                  aria-label="تغيير الحجم"
                  onPointerDown={(e) => startResize(e, 'both', 'right')}
                />
              </>
            )}
            <ComponentView
              component={c}
              boxStyle={boxStyle}
              onAction={onAction}
              onNotify={onNotify}
              onChangeComponent={onChangeComponent}
            />
          </section>
        )
      })}
    </div>
  )
}

function ComponentView({
  component,
  boxStyle,
  onAction,
  onNotify,
  onChangeComponent,
}: {
  component: UiComponent
  boxStyle?: CSSProperties
  onAction?: (action: UiAction) => void
  onNotify?: (message: string) => void
  onChangeComponent?: (next: UiComponent) => void
}) {
  const { type, props, actions = [] } = component
  const run = (action?: UiAction) => {
    if (action) onAction?.(action)
  }

  if (type === 'sidebar') {
    return <SidebarMenu props={props} boxStyle={boxStyle} onNotify={onNotify} />
  }

  if (type === 'burgermenu') {
    return <BurgerMenu props={props} boxStyle={boxStyle} onNotify={onNotify} />
  }

  if (type === 'navbar') {
    const links = asArray<string>(props.links)
    const showSearch = Boolean(props.showSearch)
    const showDropdown = Boolean(props.showDropdown)
    const showUserCard = Boolean(props.showUserCard)
    const dropdownOptions = asArray<{ value?: string; label?: string } | string>(props.dropdownOptions)
    return (
      <div className={`ui-navbar ${showSearch || showDropdown || showUserCard ? 'is-rich' : ''}`} style={boxStyle}>
        {(showSearch || showDropdown) && (
          <div className="nav-cluster nav-right">
            {showSearch && (
              <input
                className="nav-search"
                placeholder={asString(props.searchPlaceholder, 'ابحث...')}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const q = (e.target as HTMLInputElement).value
                    onNotify?.(q ? `بحث: ${q}` : 'اكتب كلمة للبحث')
                  }
                }}
              />
            )}
            {showDropdown && (
              <select
                className="nav-dropdown"
                defaultValue=""
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onNotify?.(`دروب داون: ${e.target.value || '—'}`)}
              >
                <option value="">{asString(props.dropdownPlaceholder, 'اختر...')}</option>
                {dropdownOptions.map((o, i) => {
                  const value = typeof o === 'string' ? o : asString(o.value, asString(o.label))
                  const label = typeof o === 'string' ? o : asString(o.label, value)
                  return (
                    <option key={`${value}-${i}`} value={value}>
                      {label}
                    </option>
                  )
                })}
              </select>
            )}
          </div>
        )}

        <div className="nav-center">
          <strong>{asString(props.brand, 'Brand')}</strong>
          <nav>
            {links.map((l) => (
              <a key={l} href={`#${l}`}>
                {l}
              </a>
            ))}
          </nav>
        </div>

        {showUserCard ? (
          <button
            type="button"
            className="nav-user"
            onClick={(e) => {
              e.stopPropagation()
              onNotify?.(
                `يوزر كارد: ${asString(props.userName, 'مستخدم')} · ${asString(props.userRole, '')}`,
              )
              run(actions[0])
            }}
          >
            <span className="ui-avatar sm">{asString(props.userName, 'U').slice(0, 1)}</span>
            <span className="nav-user-meta">
              <strong>{asString(props.userName, 'مستخدم')}</strong>
              <small>{asString(props.userRole, asString(props.userCity, 'Account'))}</small>
            </span>
          </button>
        ) : (
          actions[0] && (
            <button type="button" className="ui-btn" onClick={() => run(actions[0])}>
              {actions[0].label}
            </button>
          )
        )}
      </div>
    )
  }

  if (type === 'hero') {
    const backgroundImage = asString(props.backgroundImage, '')
    return (
      <div
        className={`ui-hero align-${asString(props.align, 'center')} ${backgroundImage ? 'has-bg' : ''}`}
        style={{
          ...boxStyle,
          ...(backgroundImage
            ? {
                backgroundImage: `linear-gradient(color-mix(in srgb, var(--bg) 28%, transparent), color-mix(in srgb, var(--bg) 62%, transparent)), url("${backgroundImage.replace(/"/g, '')}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {}),
        }}
      >
        <span className="eyebrow">{asString(props.eyebrow)}</span>
        <h1>{asString(props.title)}</h1>
        <p>{asString(props.subtitle)}</p>
        <button type="button" className="ui-btn" onClick={() => run(actions[0])}>
          {asString(props.ctaLabel, actions[0]?.label ?? 'ابدأ')}
        </button>
      </div>
    )
  }

  if (type === 'features') {
    const items = asArray<{ title?: string; desc?: string }>(props.items)
    return (
      <div className="ui-section" style={boxStyle}>
        <h2>{asString(props.title, 'المميزات')}</h2>
        <div className="ui-grid">
          {items.map((item, i) => (
            <article key={i} className="ui-card">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'cards') {
    const items = asArray<{ title?: string; desc?: string }>(props.items)
    return (
      <div className="ui-section" style={boxStyle}>
        <h2>{asString(props.title, 'كروت')}</h2>
        <div className="ui-grid">
          {items.map((item, i) => (
            <article key={i} className="ui-card">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'stats') {
    return <StatsBlock props={props} boxStyle={boxStyle} />
  }

  if (type === 'chart') {
    return <ChartBlock props={props} boxStyle={boxStyle} />
  }

  if (type === 'form') {
    const fields = asArray<string>(props.fields)
    return (
      <div className="ui-section ui-form" style={boxStyle}>
        <h2>{asString(props.title)}</h2>
        <p>{asString(props.subtitle)}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(actions[0])
          }}
        >
          {fields.map((f) => (
            <label key={f}>
              {f}
              {f.includes('رسالة') ? <textarea rows={3} /> : <input />}
            </label>
          ))}
          <button type="submit" className="ui-btn">
            {asString(props.submitLabel, 'إرسال')}
          </button>
        </form>
      </div>
    )
  }

  if (type === 'cta') {
    return (
      <div className="ui-cta" style={boxStyle}>
        <h2>{asString(props.title)}</h2>
        <p>{asString(props.subtitle)}</p>
        <button type="button" className="ui-btn" onClick={() => run(actions[0])}>
          {asString(props.buttonLabel, actions[0]?.label ?? 'المتابعة')}
        </button>
      </div>
    )
  }

  if (type === 'footer') {
    const links = asArray<string>(props.links)
    return (
      <div className="ui-footer" style={boxStyle}>
        <p>{asString(props.text)}</p>
        <div>
          {links.map((l) => (
            <a key={l} href={`#${l}`}>
              {l}
            </a>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'button') {
    return (
      <div className="ui-section" style={{ textAlign: 'center', ...boxStyle }}>
        <button type="button" className="ui-btn" onClick={() => run(actions[0])}>
          {asString(props.label, actions[0]?.label ?? 'زر')}
        </button>
      </div>
    )
  }

  if (type === 'search') {
    return <SearchBlock props={props} boxStyle={boxStyle} onNotify={onNotify} />
  }

  if (type === 'select' || type === 'dropdown') {
    return (
      <SelectBlock
        mode={type === 'dropdown' ? 'dropdown' : 'select'}
        props={props}
        boxStyle={boxStyle}
        componentId={component.id}
        onNotify={onNotify}
      />
    )
  }

  if (type === 'multiselect') {
    return (
      <SelectBlock
        mode="multiselect"
        props={props}
        boxStyle={boxStyle}
        componentId={component.id}
        onNotify={onNotify}
      />
    )
  }

  if (type === 'usercard') {
    return <UserCardBlock props={props} boxStyle={boxStyle} onNotify={onNotify} />
  }

  if (type === 'colorpicker') {
    return (
      <PickerBlock
        kind="color"
        props={props}
        boxStyle={boxStyle}
        componentId={component.id}
        onNotify={onNotify}
      />
    )
  }

  if (type === 'datepicker') {
    return (
      <PickerBlock
        kind="date"
        props={props}
        boxStyle={boxStyle}
        componentId={component.id}
        onNotify={onNotify}
      />
    )
  }

  if (type === 'timepicker') {
    return (
      <PickerBlock
        kind="time"
        props={props}
        boxStyle={boxStyle}
        componentId={component.id}
        onNotify={onNotify}
      />
    )
  }

  if (type === 'sections') {
    return (
      <SectionsGrid
        props={props}
        boxStyle={boxStyle}
        onNotify={onNotify}
        onAction={onAction}
        onChangeProps={(nextProps) =>
          onChangeComponent?.({
            ...component,
            props: nextProps,
          })
        }
        renderNested={(child, onChange) => (
          <ComponentView
            component={child}
            onAction={onAction}
            onNotify={onNotify}
            onChangeComponent={onChange}
          />
        )}
      />
    )
  }

  if (type === 'split') {
    const left = asRecord(props.left)
    const right = asRecord(props.right)
    const setPane = (side: 'left' | 'right', nextPane: Record<string, unknown>) => {
      onChangeComponent?.({
        ...component,
        props: { ...props, [side]: nextPane },
      })
    }
    return (
      <div className="ui-section ui-split-section" style={boxStyle}>
        {asString(props.title) && <h2 className="ui-split-title">{asString(props.title)}</h2>}
        <div
          className="ui-split"
          style={{ gridTemplateColumns: asString(props.ratio, '1fr 1fr') }}
        >
          <div className="ui-split-pane">
            {renderPane(left, run, onNotify, (p) => setPane('left', p))}
          </div>
          <div className="ui-split-pane">
            {renderPane(right, run, onNotify, (p) => setPane('right', p))}
          </div>
        </div>
      </div>
    )
  }

  if (type === 'stack') {
    const items = normalizeStackItems(props.items)
    return (
      <div className="ui-section ui-stack-section" style={boxStyle}>
        <h2>{asString(props.title, 'بطاقة')}</h2>
        {asString(props.subtitle) && <p className="ui-stack-sub">{asString(props.subtitle)}</p>}
        <div className={props.inCard === false ? 'ui-stack' : 'ui-stack ui-stack-card'}>
          {items.length === 0 && <p className="ui-stack-text">لا يوجد عناصر بالبطاقة</p>}
          {items.map((item, i) => {
            const kind = asString(item.kind, 'text')
            if (kind === 'button') {
              return (
                <button
                  key={i}
                  type="button"
                  className="ui-btn"
                  onClick={() => run(actions[0])}
                >
                  {asString(item.label, 'زر')}
                </button>
              )
            }
            if (kind === 'image') {
              return (
                <ImageUploadSlot
                  key={i}
                  src={asString(item.src)}
                  alt={asString(item.alt, 'صورة')}
                  caption={asString(item.caption, 'اضغط لرفع صورة')}
                  onNotify={onNotify}
                  onUploaded={(url, name) => {
                    const nextItems = items.map((it, idx) =>
                      idx === i ? { ...it, src: url, caption: it.caption ?? name } : it,
                    )
                    onChangeComponent?.({
                      ...component,
                      props: { ...props, items: nextItems },
                    })
                  }}
                />
              )
            }
            if (kind === 'link') {
              return (
                <a
                  key={i}
                  className="ui-link"
                  href={asString(item.href, '#')}
                  onClick={(e) => {
                    e.preventDefault()
                    run(actions[1] ?? actions[0])
                  }}
                >
                  {asString(item.label, 'رابط')}
                </a>
              )
            }
            return (
              <p key={i} className="ui-stack-text">
                {asString(item.text, asString(item.label))}
              </p>
            )
          })}
        </div>
      </div>
    )
  }

  if (type === 'image') {
    return (
      <div className="ui-section ui-image-block" style={boxStyle}>
        <ImageUploadSlot
          src={asString(props.src)}
          alt={asString(props.alt, 'صورة')}
          caption={asString(props.caption, 'اضغط لرفع صورة')}
          tall
          onNotify={onNotify}
          onUploaded={(url, name) => {
            onChangeComponent?.({
              ...component,
              props: {
                ...props,
                src: url,
                caption: asString(props.caption) || name,
              },
            })
          }}
        />
      </div>
    )
  }

  if (type === 'login') {
    return (
      <div className="ui-section ui-login" style={boxStyle}>
        <LoginFields
          title={asString(props.title, 'تسجيل الدخول')}
          titleTag="h2"
          userLabel={loginUserLabel(props)}
          passwordLabel={asString(props.passwordLabel, 'كلمة المرور')}
          submitLabel={asString(props.submitLabel, 'دخول')}
          showSignup={props.showSignup !== false}
          signupLabel={asString(props.signupLabel, 'إنشاء حساب جديد')}
          onSubmit={(user, pass) => submitLogin(user, pass, onNotify, onAction, component.id)}
          onSignup={() => run(actions[1] ?? actions[0])}
        />
      </div>
    )
  }

  if (type === 'profile') {
    return (
      <div className="ui-profile" style={boxStyle}>
        <div className="ui-cover">{asString(props.coverLabel, 'صورة الغلاف')}</div>
        <div className="ui-profile-body">
          <div className="ui-avatar">{asString(props.name, 'U').slice(0, 1)}</div>
          <div className="ui-profile-meta">
            <h2>{asString(props.name)}</h2>
            <p>{asString(props.meta)}</p>
            <p>{asString(props.bio)}</p>
            <div className="ui-profile-stats">
              <span>
                <strong>{asString(props.friends, '0')}</strong> أصدقاء
              </span>
              <span>
                <strong>{asString(props.posts, '0')}</strong> منشورات
              </span>
              <span>
                <strong>{asString(props.photos, '0')}</strong> صور
              </span>
            </div>
            <button type="button" className="ui-btn" onClick={() => run(actions[0])}>
              {asString(props.ctaLabel, 'تعديل الملف')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (type === 'feed') {
    const posts = asArray<{
      author?: string
      time?: string
      text?: string
      likes?: string
      comments?: string
      shares?: string
    }>(props.posts)
    return (
      <div className="ui-section ui-feed" style={boxStyle}>
        <h2>{asString(props.title, 'المنشورات')}</h2>
        <div className="ui-composer">
          <input placeholder={asString(props.composerPlaceholder, 'بماذا تفكر؟')} />
          <button type="button" className="ui-btn" onClick={() => run(actions[0])}>
            نشر
          </button>
        </div>
        <div className="ui-posts">
          {posts.map((post, i) => (
            <article key={i} className="ui-post">
              <header>
                <div className="ui-avatar sm">{asString(post.author, 'U').slice(0, 1)}</div>
                <div>
                  <strong>{post.author}</strong>
                  <small>{post.time}</small>
                </div>
              </header>
              <p>{post.text}</p>
              <footer>
                <button type="button" onClick={() => run(actions[1])}>
                  إعجاب · {post.likes}
                </button>
                <button type="button" onClick={() => run(actions[2])}>
                  تعليق · {post.comments}
                </button>
                <button type="button" onClick={() => run(actions[3])}>
                  مشاركة · {post.shares}
                </button>
              </footer>
            </article>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="ui-section" style={boxStyle}>
      <h2>{asString(props.title, type)}</h2>
      <p>{asString(props.text, asString(props.subtitle, JSON.stringify(props)))}</p>
    </div>
  )
}

function loginUserLabel(source: Record<string, unknown>) {
  const custom = asString(source.usernameLabel, '').trim()
  if (custom) return custom
  const legacy = asString(source.emailLabel, '').trim()
  if (!legacy || /بريد|email/i.test(legacy)) return 'اسم المستخدم'
  return legacy
}

function submitLogin(
  user: string,
  pass: string,
  onNotify: ((message: string) => void) | undefined,
  onAction: ((action: UiAction) => void) | undefined,
  id = 'login',
) {
  if (!user || !pass) {
    onNotify?.('اكتب اليوزر نيم والباسورد')
    return
  }
  onAction?.({
    id: `${id}-next`,
    type: 'navigate',
    label: 'دخول',
    target: 'next-page',
    payload: 'next-page',
  })
}

function LoginFields({
  title,
  titleTag: Title,
  userLabel,
  passwordLabel,
  submitLabel,
  showSignup,
  signupLabel,
  compact,
  onSubmit,
  onSignup,
}: {
  title: string
  titleTag: 'h2' | 'h3'
  userLabel: string
  passwordLabel: string
  submitLabel: string
  showSignup: boolean
  signupLabel: string
  compact?: boolean
  onSubmit: (user: string, pass: string) => void
  onSignup: () => void
}) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  return (
    <form
      className={`ui-login-card${compact ? ' compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(user.trim(), pass.trim())
      }}
    >
      <Title>{title}</Title>
      <label>
        {userLabel}
        <input
          type="text"
          name="username"
          autoComplete="username"
          placeholder="username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
      </label>
      <label>
        {passwordLabel}
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </label>
      <button type="submit" className="ui-btn">
        {submitLabel}
      </button>
      {showSignup && (
        <button type="button" className="ui-btn ghost" onClick={onSignup}>
          {signupLabel}
        </button>
      )}
    </form>
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function renderPane(
  pane: Record<string, unknown>,
  run: (action?: UiAction) => void,
  onNotify?: (message: string) => void,
  onPaneChange?: (next: Record<string, unknown>) => void,
) {
  const kind = asString(pane.kind, 'text')
  if (kind === 'image') {
    return (
      <ImageUploadSlot
        src={asString(pane.src)}
        alt={asString(pane.alt, 'صورة')}
        caption={asString(pane.caption, 'اضغط لرفع صورة')}
        tall
        onNotify={onNotify}
        onUploaded={(url, name) => {
          onPaneChange?.({
            ...pane,
            src: url,
            caption: asString(pane.caption) || name,
          })
        }}
      />
    )
  }
  if (kind === 'login') {
    return (
      <LoginFields
        compact
        title={asString(pane.title, 'تسجيل الدخول')}
        titleTag="h3"
        userLabel={loginUserLabel(pane)}
        passwordLabel={asString(pane.passwordLabel, 'كلمة المرور')}
        submitLabel={asString(pane.submitLabel, 'دخول')}
        showSignup={pane.showSignup !== false}
        signupLabel={asString(pane.signupLabel, 'إنشاء حساب جديد')}
        onSubmit={(user, pass) => submitLogin(user, pass, onNotify, run)}
        onSignup={() => onNotify?.('إنشاء حساب')}
      />
    )
  }
  if (kind === 'form') {
    const fields = asArray<string>(pane.fields)
    return (
      <div className="ui-login-card compact">
        <h3>{asString(pane.title, 'نموذج')}</h3>
        <p>{asString(pane.subtitle)}</p>
        {fields.map((f) => (
          <label key={f}>
            {f}
            <input placeholder={f} />
          </label>
        ))}
        <button type="button" className="ui-btn" onClick={() => run()}>
          {asString(pane.submitLabel, 'إرسال')}
        </button>
      </div>
    )
  }
  if (kind === 'search') {
    return (
      <div className="ui-split-simple">
        <h3>{asString(pane.title, 'بحث')}</h3>
        <input className="ui-search-input" placeholder={asString(pane.placeholder, 'ابحث...')} />
      </div>
    )
  }
  return (
    <div className="ui-split-simple">
      <h3>{asString(pane.title, 'نص')}</h3>
      <p>{asString(pane.text, 'محتوى هذا العمود')}</p>
    </div>
  )
}
