import { ChevronDown, Plus, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import type { CatalogItem, UiComponent, UiPage } from '../types'
import { useAskPrompt } from './NicePrompt'

type Props = {
  page: UiPage
  selectedId: string | null
  catalog: CatalogItem[]
  onChangePage: (page: UiPage) => void
  onSelect: (id: string | null) => void
  onNotify?: (msg: string) => void
}

const TEXT_KEYS = [
  'title',
  'subtitle',
  'brand',
  'name',
  'bio',
  'meta',
  'ctaLabel',
  'buttonLabel',
  'label',
  'submitLabel',
  'text',
  'eyebrow',
] as const

export function SpaceEditDock({ page, selectedId, catalog, onChangePage, onSelect, onNotify }: Props) {
  const ask = useAskPrompt()
  const [editOpen, setEditOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const selected = page.components.find((c) => c.id === selectedId) ?? null

  const updateSelected = (next: UiComponent) => {
    onChangePage({
      ...page,
      components: page.components.map((c) => (c.id === next.id ? next : c)),
    })
  }

  const uploadForSelected = async (file: File | null, prop: 'src' | 'backgroundImage' = 'src') => {
    if (!selected || !file) return
    setUploading(true)
    try {
      const { url } = await api.uploadImage(file)
      updateSelected({
        ...selected,
        props:
          prop === 'backgroundImage'
            ? { ...selected.props, backgroundImage: url }
            : { ...selected.props, src: url, caption: selected.props.caption ?? file.name },
      })
      onNotify?.('تم رفع الصورة')
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'فشل رفع الصورة')
    } finally {
      setUploading(false)
    }
  }

  const removeSelected = () => {
    if (!selected) return
    void (async () => {
      const ok = await ask({
        title: 'تأكيد الحذف',
        label: 'هل أنت متأكد من حذف هذا الكمبوننت؟',
        confirmLabel: 'حذف',
        cancelLabel: 'إلغاء',
        confirm: true,
      })
      if (!ok) return
      onChangePage({
        ...page,
        components: page.components.filter((c) => c.id !== selected.id),
      })
      onSelect(null)
    })()
  }

  const addComponent = async (type: string) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`
    let created = minimalComponent(type, id)
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
          ...created.props,
          count,
          cells: Array.from({ length: count }, () => ({ items: [] })),
        },
      }
    }
    const footerIdx = page.components.findIndex((c) => c.type === 'footer')
    const components =
      footerIdx >= 0
        ? [
            ...page.components.slice(0, footerIdx),
            created,
            ...page.components.slice(footerIdx),
          ]
        : [...page.components, created]
    onChangePage({ ...page, components })
    onSelect(id)
  }

  return (
    <div className="space-dock">
      <div className="space-dock-add">
        <span>أضف بإيدك:</span>
        {catalog
          .filter((item) =>
            [
              'navbar',
              'sidebar',
              'burgermenu',
              'sections',
              'hero',
              'image',
              'login',
              'colorpicker',
              'datepicker',
              'timepicker',
              'search',
              'button',
              'form',
              'usercard',
              'footer',
            ].includes(item.type),
          )
          .concat(catalog.filter((item) => !['navbar', 'sidebar', 'burgermenu', 'sections', 'hero', 'image', 'login', 'colorpicker', 'datepicker', 'timepicker', 'search', 'button', 'form', 'usercard', 'footer'].includes(item.type)).slice(0, 4))
          .map((item) => (
          <button key={item.type} type="button" onClick={() => void addComponent(item.type)}>
            <Plus size={12} />
            {item.label}
          </button>
        ))}
      </div>

      {selected ? (
        <div className={`space-dock-edit collapse ${editOpen ? 'open' : ''}`}>
          <div className="space-dock-edit-head">
            <button
              type="button"
              className="collapse-trigger"
              onClick={() => setEditOpen((v) => !v)}
              aria-expanded={editOpen}
            >
              <ChevronDown size={16} className={`collapse-chevron ${editOpen ? 'open' : ''}`} />
              <strong>تعديل: {selected.type}</strong>
            </button>
            <div className="space-dock-edit-actions">
              <button type="button" className="danger-btn" onClick={removeSelected} title="حذف">
                <Trash2 size={14} />
              </button>
              <button type="button" className="ghost-btn" onClick={() => onSelect(null)} title="إغلاق">
                <X size={14} />
              </button>
            </div>
          </div>

          {editOpen && (
            <div className="collapse-body">
              {selected.type === 'sections' && (
                <label className="api-field">
                  عدد الأجزاء
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={Math.min(12, Math.max(1, Number(selected.props.count ?? selected.props.columns ?? 1) || 1))}
                    onChange={(e) => {
                      const nextCount = Math.min(12, Math.max(1, Number(e.target.value) || 1))
                      const raw = Array.isArray(selected.props.cells) ? [...selected.props.cells] : []
                      while (raw.length < nextCount) raw.push({ items: [] })
                      updateSelected({
                        ...selected,
                        props: { ...selected.props, count: nextCount, cells: raw.slice(0, nextCount) },
                      })
                    }}
                  />
                  <small>للمساعدة بالبناء فقط، ما بتظهر جوّا الكمبوننت</small>
                </label>
              )}
              {API_DEFAULTS[selected.type] && (
                <label className="api-field">
                  API من الباك اند
                  <input
                    dir="ltr"
                    placeholder={API_DEFAULTS[selected.type]}
                    value={String(selected.props.apiUrl ?? API_DEFAULTS[selected.type])}
                    onChange={(e) =>
                      updateSelected({
                        ...selected,
                        props: {
                          ...selected.props,
                          source: 'api',
                          apiUrl: e.target.value,
                        },
                      })
                    }
                  />
                  <small>حطي مسار مثل /api/demo/options أو رابط كامل</small>
                </label>
              )}
              <div className="layout-quick">
                <SizeStepper
                  label="ارتفاع الديف"
                  value={String(selected.props.minHeight ?? '')}
                  placeholder="100"
                  step={selected.type === 'navbar' ? 8 : 10}
                  fallback={100}
                  units={['px', '%', 'vh', 'vw']}
                  onChange={(v) =>
                    updateSelected({
                      ...selected,
                      props: { ...selected.props, minHeight: v },
                    })
                  }
                />
                <small>اكتبي 100 واختاري الوحدة vh عشان يصير ارتفاع الشاشة.</small>
                <DeviceWidth
                  label="العرض على الشاشة"
                  hint="النص والثلث للعرض. «الباقي» يعبّي الفراغ اللي ضل جنبهم."
                  value={String(selected.props.maxWidth ?? '')}
                  onChange={(v) =>
                    updateSelected({ ...selected, props: { ...selected.props, maxWidth: v } })
                  }
                />
                <DeviceWidth
                  label="العرض على الآيباد"
                  hint="بدّلي المعاينة لآيباد من فوق عشان تشوفي هالعرض."
                  value={String(selected.props.maxWidthTablet ?? '')}
                  onChange={(v) =>
                    updateSelected({ ...selected, props: { ...selected.props, maxWidthTablet: v } })
                  }
                />
                <DeviceWidth
                  label="العرض على التلفون"
                  hint="بالتلفون القسم عادة سطر كامل. بدّلي المعاينة لتلفون من فوق."
                  value={String(selected.props.maxWidthPhone ?? '')}
                  onChange={(v) =>
                    updateSelected({ ...selected, props: { ...selected.props, maxWidthPhone: v } })
                  }
                />
                <SizeStepper
                  label="المسافة بيناتهم"
                  value={String(selected.props.rowGap ?? '')}
                  placeholder="12"
                  step={4}
                  fallback={12}
                  units={['px', '%', 'vh', 'vw']}
                  onChange={(v) =>
                    updateSelected({
                      ...selected,
                      props: {
                        ...selected.props,
                        rowGap: v,
                      },
                    })
                  }
                />
                {selected.type === 'hero' && (
                  <>
                    <label className="upload-field">
                      صورة خلفية الهيرو
                      <span className="upload-row">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploading}
                          onChange={(e) => void uploadForSelected(e.target.files?.[0] ?? null, 'backgroundImage')}
                        />
                        <span className="upload-hint">
                          <Upload size={14} />
                          {uploading ? 'عم نرفع…' : 'ارفعي صورة للخلفية'}
                        </span>
                      </span>
                      <input
                        value={String(selected.props.backgroundImage ?? '')}
                        placeholder="/uploads/… أو رابط"
                        onChange={(e) =>
                          updateSelected({
                            ...selected,
                            props: { ...selected.props, backgroundImage: e.target.value },
                          })
                        }
                      />
                    </label>
                    <div className="layout-width-btns">
                      {(
                        [
                          ['start', 'يمين'],
                          ['center', 'وسط'],
                          ['end', 'يسار'],
                        ] as const
                      ).map(([align, label]) => (
                        <button
                          key={align}
                          type="button"
                          className={String(selected.props.align ?? 'center') === align ? 'active' : ''}
                          onClick={() =>
                            updateSelected({
                              ...selected,
                              props: { ...selected.props, align },
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className={`collapse-panel ${sizeOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="collapse-trigger nested"
                  onClick={() => setSizeOpen((v) => !v)}
                  aria-expanded={sizeOpen}
                >
                  <ChevronDown size={14} className={`collapse-chevron ${sizeOpen ? 'open' : ''}`} />
                  <span>حجم السيكشن</span>
                </button>
                {sizeOpen && (
                  <div className="space-size-controls collapse-panel-body">
                    <div className="space-size-btns" dir="ltr">
                      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={String(selected.props.sectionSize ?? 'md') === size ? 'active' : ''}
                          onClick={() => {
                            const presets = SIZE_PRESETS[selected.type] ?? SIZE_PRESETS.default
                            updateSelected({
                              ...selected,
                              props: {
                                ...selected.props,
                                sectionSize: size,
                                minHeight: presets[size],
                              },
                            })
                          }}
                        >
                          {size === 'sm' ? 'صغير' : size === 'md' ? 'وسط' : size === 'lg' ? 'كبير' : 'ضخم'}
                        </button>
                      ))}
                    </div>
                    <div className="space-size-numbers">
                      <div className="space-size-group">
                        <span>Margin</span>
                        <div className="space-size-row">
                          <SizeStepper
                            label="فوق"
                            value={String(selected.props.marginTop ?? '')}
                            placeholder="0px"
                            step={8}
                            fallback={0}
                            onChange={(v) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, marginTop: v },
                              })
                            }
                          />
                          <SizeStepper
                            label="تحت"
                            value={String(selected.props.marginBottom ?? '')}
                            placeholder="0px"
                            step={8}
                            fallback={0}
                            onChange={(v) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, marginBottom: v },
                              })
                            }
                          />
                          <SizeStepper
                            label="يمين/يسار"
                            value={String(selected.props.marginInline ?? '')}
                            placeholder="0px"
                            step={8}
                            fallback={0}
                            onChange={(v) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, marginInline: v },
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-size-group">
                        <span>Padding</span>
                        <div className="space-size-row">
                          <SizeStepper
                            label="فوق"
                            value={String(selected.props.paddingTop ?? '')}
                            placeholder="0px"
                            step={8}
                            fallback={0}
                            onChange={(v) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, paddingTop: v },
                              })
                            }
                          />
                          <SizeStepper
                            label="تحت"
                            value={String(selected.props.paddingBottom ?? '')}
                            placeholder="0px"
                            step={8}
                            fallback={0}
                            onChange={(v) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, paddingBottom: v },
                              })
                            }
                          />
                          <SizeStepper
                            label="يمين/يسار"
                            value={String(selected.props.paddingInline ?? '')}
                            placeholder="0px"
                            step={8}
                            fallback={0}
                            onChange={(v) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, paddingInline: v },
                              })
                            }
                          />
                        </div>
                      </div>
                      <SizeStepper
                        label="Radius"
                        value={String(selected.props.radius ?? '')}
                        placeholder="14px"
                        step={4}
                        fallback={14}
                        onChange={(v) =>
                          updateSelected({
                            ...selected,
                            props: { ...selected.props, radius: v },
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className={`collapse-panel ${contentOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="collapse-trigger nested"
                  onClick={() => setContentOpen((v) => !v)}
                  aria-expanded={contentOpen}
                >
                  <ChevronDown size={14} className={`collapse-chevron ${contentOpen ? 'open' : ''}`} />
                  <span>المحتوى والنصوص</span>
                </button>
                {contentOpen && (
                  <div className="space-dock-fields collapse-panel-body">
                    {(selected.type === 'image' || 'src' in selected.props) && (
                      <label className="upload-field">
                        صورة
                        <span className="upload-row">
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploading}
                            onChange={(e) => void uploadForSelected(e.target.files?.[0] ?? null)}
                          />
                          <span className="upload-hint">
                            <Upload size={14} />
                            {uploading ? 'عم نرفع…' : 'ارفع من جهازك'}
                          </span>
                        </span>
                        {typeof selected.props.src === 'string' && selected.props.src && (
                          <input
                            value={String(selected.props.src)}
                            onChange={(e) =>
                              updateSelected({
                                ...selected,
                                props: { ...selected.props, src: e.target.value },
                              })
                            }
                            placeholder="/uploads/…"
                          />
                        )}
                      </label>
                    )}
                    {TEXT_KEYS.filter(
                      (k) => k in selected.props && typeof selected.props[k] !== 'object',
                    ).map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          value={String(selected.props[key] ?? '')}
                          onChange={(e) =>
                            updateSelected({
                              ...selected,
                              props: { ...selected.props, [key]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="space-dock-hint">اضغط أي قسم بالصفحة فوق عشان تعدّله بإيدك (حجم / نصوص / حذف / إضافة).</p>
      )}
    </div>
  )
}

const API_DEFAULTS: Record<string, string> = {
  dropdown: '/api/demo/options',
  select: '/api/demo/options',
  multiselect: '/api/demo/options',
  stats: '/api/demo/stats',
  chart: '/api/demo/chart',
}

const SIZE_PRESETS: Record<string, Record<'sm' | 'md' | 'lg' | 'xl', string>> = {
  navbar: { sm: '48px', md: '64px', lg: '88px', xl: '120px' },
  footer: { sm: '64px', md: '96px', lg: '140px', xl: '180px' },
  default: { sm: '180px', md: '280px', lg: '420px', xl: '560px' },
}

function parsePx(value: string, fallback: number): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function splitLength(value: string, fallbackUnit = 'px'): { n: number; unit: string } {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|%|vh|vw)?$/i)
  if (!match) return { n: Number.NaN, unit: fallbackUnit }
  return { n: Number(match[1]), unit: (match[2] || fallbackUnit).toLowerCase() }
}

function DeviceWidth({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <>
      <SizeStepper
        label={label}
        value={value}
        placeholder="100"
        step={10}
        fallback={100}
        units={['px', '%', 'vh', 'vw']}
        onChange={onChange}
      />
      <div className="layout-width-btns">
        {(
          [
            ['100%', 'سطر كامل'],
            ['50%', 'نص'],
            ['33%', 'ثلث'],
            ['fill', 'الباقي'],
          ] as const
        ).map(([width, name]) => (
          <button
            key={width}
            type="button"
            className={value === width ? 'active' : ''}
            onClick={() => onChange(width)}
          >
            {name}
          </button>
        ))}
      </div>
      <small>{hint}</small>
    </>
  )
}

function formatLength(n: number, unit: string): string {
  const safe = Math.max(0, Number.isFinite(n) ? n : 0)
  const rounded = unit === 'px' ? Math.round(safe) : Math.round(safe * 10) / 10
  return `${rounded}${unit}`
}

function SizeStepper({
  label,
  value,
  placeholder,
  step,
  fallback,
  units,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  step: number
  fallback: number
  units?: string[]
  onChange: (value: string) => void
}) {
  const parsed = splitLength(value)
  const unit = units?.includes(parsed.unit) ? parsed.unit : (units?.[0] ?? 'px')
  const shown = value.trim() && Number.isFinite(parsed.n) ? parsed.n : ''

  const bump = (delta: number) => {
    const base = Number.isFinite(parsed.n) ? parsed.n : fallback
    onChange(formatLength(base + delta, unit))
  }

  return (
    <label className="size-stepper">
      {label}
      <div className={`size-stepper-row ${units ? 'has-unit' : ''}`} dir="ltr">
        <button type="button" onClick={() => bump(-step)} aria-label="إنقاص">
          −
        </button>
        <input
          type="number"
          min={0}
          step={step}
          placeholder={placeholder}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onChange('')
              return
            }
            onChange(formatLength(Number(raw), unit))
          }}
        />
        {units && (
          <select
            aria-label="الوحدة"
            value={unit}
            onChange={(e) => {
              const nextUnit = e.target.value
              const base = Number.isFinite(parsed.n) ? parsed.n : fallback
              onChange(formatLength(base, nextUnit))
            }}
          >
            {units.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => bump(step)} aria-label="زيادة">
          +
        </button>
      </div>
    </label>
  )
}

function minimalComponent(type: string, id: string): UiComponent {
  switch (type) {
    case 'hero':
      return {
        id,
        type,
        props: { eyebrow: 'New', title: 'عنوان جديد', subtitle: 'وصف', ctaLabel: 'ابدأ', align: 'center' },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'ابدأ', payload: 'ok' }],
      }
    case 'login':
      return {
        id,
        type,
        props: {
          title: 'تسجيل الدخول',
          usernameLabel: 'اسم المستخدم',
          passwordLabel: 'كلمة المرور',
          submitLabel: 'دخول',
          showSignup: true,
          signupLabel: 'إنشاء حساب',
        },
        actions: [{ id: `${id}-a`, type: 'navigate', label: 'دخول', target: 'next-page', payload: 'next-page' }],
      }
    case 'profile':
      return {
        id,
        type,
        props: {
          name: 'مستخدم',
          meta: 'المدينة',
          bio: 'نبذة',
          friends: '10',
          posts: '3',
          photos: '2',
          coverLabel: 'غلاف',
          ctaLabel: 'تعديل',
        },
      }
    case 'feed':
      return {
        id,
        type,
        props: {
          title: 'المنشورات',
          composerPlaceholder: 'بماذا تفكر؟',
          posts: [
            { author: 'أنت', time: 'الآن', text: 'منشور جديد', likes: '0', comments: '0', shares: '0' },
          ],
        },
        actions: [
          { id: `${id}-a`, type: 'alert', label: 'نشر', payload: 'post' },
          { id: `${id}-b`, type: 'alert', label: 'إعجاب', payload: 'like' },
          { id: `${id}-c`, type: 'alert', label: 'تعليق', payload: 'comment' },
          { id: `${id}-d`, type: 'alert', label: 'مشاركة', payload: 'share' },
        ],
      }
    case 'form':
      return {
        id,
        type,
        props: {
          title: 'تواصل',
          subtitle: 'اترك رسالة',
          fields: ['الاسم', 'البريد', 'الرسالة'],
          submitLabel: 'إرسال',
        },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'إرسال', payload: 'sent' }],
      }
    case 'navbar':
      return {
        id,
        type,
        props: { brand: 'Brand', links: ['الرئيسية', 'حول'] },
        actions: [{ id: `${id}-a`, type: 'scroll', label: 'ابدأ', target: '#hero' }],
      }
    case 'sidebar':
      return {
        id,
        type,
        props: {
          brand: 'القائمة',
          links: ['الرئيسية', 'لوحة التحكم', 'الطلبات', 'الإعدادات'],
          footerNote: 'Sidebar menu',
          collapsed: false,
        },
      }
    case 'burgermenu':
      return {
        id,
        type,
        props: {
          brand: 'علامتي',
          drawerTitle: 'القائمة',
          links: ['الرئيسية', 'حول', 'الخدمات', 'تواصل'],
          ctaLabel: 'ابدأ',
          showCta: true,
          defaultOpen: false,
        },
      }
    case 'sections':
      return {
        id,
        type,
        props: {
          title: 'أقسام',
          count: 3,
          cells: [
            { kind: 'text', title: 'جزء 1', text: 'اكتب نصك هنا أو غيّر النوع لصورة/زر' },
            { kind: 'image', alt: 'صورة', caption: 'اضغط لرفع صورة', src: '' },
            { kind: 'button', label: 'اضغط هنا' },
          ],
        },
      }
    case 'footer':
      return { id, type, props: { text: '© AI UI Builder', links: ['خصوصية'] } }
    case 'image':
      return {
        id,
        type,
        props: { alt: 'صورة', caption: 'ارفع صورة', src: '' },
      }
    case 'colorpicker':
      return {
        id,
        type,
        props: { title: 'Color picker', subtitle: 'اختاري لون', label: 'اللون', value: '#0F766E' },
      }
    case 'datepicker':
      return {
        id,
        type,
        props: {
          title: 'Date picker',
          subtitle: 'اختاري تاريخ',
          label: 'التاريخ',
          value: new Date().toISOString().slice(0, 10),
        },
      }
    case 'timepicker':
      return {
        id,
        type,
        props: { title: 'Time picker', subtitle: 'اختاري وقت', label: 'الوقت', value: '09:30' },
      }
    case 'stack':
      return {
        id,
        type,
        props: {
          title: 'بطاقة',
          inCard: true,
          items: [
            { kind: 'button', label: 'زر' },
            { kind: 'image', alt: 'صورة', caption: 'صورة' },
            { kind: 'link', label: 'رابط', href: '#' },
          ],
        },
        actions: [
          { id: `${id}-a`, type: 'alert', label: 'زر', payload: 'btn' },
          { id: `${id}-b`, type: 'alert', label: 'رابط', payload: 'link' },
        ],
      }
    case 'cta':
      return {
        id,
        type,
        props: { title: 'CTA', subtitle: 'وصف', buttonLabel: 'متابعة' },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'متابعة', payload: 'cta' }],
      }
    default:
      return {
        id,
        type: type === 'cards' || type === 'features' ? type : 'text',
        props:
          type === 'cards' || type === 'features'
            ? {
                title: type === 'features' ? 'مميزات' : 'كروت',
                items: [
                  { title: 'عنصر 1', desc: 'وصف' },
                  { title: 'عنصر 2', desc: 'وصف' },
                ],
              }
            : { title: 'نص', text: 'محتوى' },
      }
  }
}
