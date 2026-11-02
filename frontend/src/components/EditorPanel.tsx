import { GripVertical, Plus, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import type { CatalogItem, UiAction, UiComponent, UiPage } from '../types'
import { useAskPrompt } from './NicePrompt'
import { ThemeBuilder } from './ThemeBuilder'

type Props = {
  page: UiPage
  selectedId: string | null
  catalog: CatalogItem[]
  onChangePage: (page: UiPage) => void
  onSelect: (id: string | null) => void
}

export function EditorPanel({ page, selectedId, catalog, onChangePage, onSelect }: Props) {
  const ask = useAskPrompt()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const selected = page.components.find((c) => c.id === selectedId) ?? null

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= page.components.length || to >= page.components.length) {
      return
    }
    const next = [...page.components]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChangePage({ ...page, components: next })
  }

  const updateSelected = (next: UiComponent) => {
    onChangePage({
      ...page,
      components: page.components.map((c) => (c.id === next.id ? next : c)),
    })
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
    onChangePage({ ...page, components: [...page.components, created] })
    onSelect(id)
  }

  const addAction = () => {
    if (!selected) return
    const action: UiAction = {
      id: `act-${Math.random().toString(36).slice(2, 6)}`,
      type: 'alert',
      label: 'أكشن جديد',
      payload: 'تم تشغيل الأكشن',
    }
    updateSelected({ ...selected, actions: [...(selected.actions ?? []), action] })
  }

  return (
    <aside className="panel editor-panel">
      <header className="panel-head">
        <Zap size={18} />
        <div>
          <h2>تحرير</h2>
          <p>كمبوننتس · ثيم · أكشنز</p>
        </div>
      </header>

      <div className="editor-scroll">
        <ThemeBuilder
          theme={page.theme}
          onChange={(theme) => onChangePage({ ...page, theme })}
        />

        <div className="side-section">
          <h3>مكتبة الكمبوننتس</h3>
          <div className="catalog-grid">
            <p className="hint" style={{ marginTop: 0 }}>
              اسحبي الكمبوننت للـ Space، أو اضغطي عليه للإضافة.
            </p>
            {catalog.map((item) => (
              <button
                key={item.type}
                type="button"
                className="catalog-item"
                draggable
                title="اسحب للـ Space أو اضغط للإضافة"
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-ui-type', item.type)
                  e.dataTransfer.setData('text/plain', item.type)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => void addComponent(item.type)}
              >
                <Plus size={14} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="side-section">
          <div className="side-title-row">
            <h3>طبقات الصفحة</h3>
            <small className="hint">اسحب لإعادة الترتيب</small>
          </div>
          <div className="layers">
            {page.components.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                ما في طبقات بعد — أضيفي من المكتبة أو الشات
              </p>
            )}
            {page.components.map((c, index) => (
              <div
                key={c.id}
                className={`layer ${selectedId === c.id ? 'active' : ''} ${overIndex === index ? 'drag-over' : ''} ${dragIndex === index ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', c.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (overIndex !== index) setOverIndex(index)
                }}
                onDragLeave={() => {
                  if (overIndex === index) setOverIndex(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null) reorder(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onClick={() => onSelect(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(c.id)
                }}
              >
                <span className="layer-grip" title="اسحب">
                  <GripVertical size={14} />
                </span>
                <span className="layer-main">
                  <span>{c.type}</span>
                  <small>{c.id}</small>
                </span>
                <span className="layer-index">{index + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="side-section">
            <div className="side-title-row">
              <h3>تعديل: {selected.type}</h3>
              <button type="button" className="danger-btn" onClick={removeSelected}>
                <Trash2 size={14} />
              </button>
            </div>

            {Object.entries(selected.props).map(([key, value]) => {
              if (typeof value === 'object') {
                return (
                  <label key={key} className="field">
                    {key} (JSON)
                    <textarea
                      rows={4}
                      value={JSON.stringify(value, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value) as unknown
                          updateSelected({
                            ...selected,
                            props: { ...selected.props, [key]: parsed },
                          })
                        } catch {
                          /* keep typing */
                        }
                      }}
                    />
                  </label>
                )
              }
              return (
                <label key={key} className="field">
                  {key}
                  <input
                    value={String(value ?? '')}
                    onChange={(e) =>
                      updateSelected({
                        ...selected,
                        props: { ...selected.props, [key]: e.target.value },
                      })
                    }
                  />
                </label>
              )
            })}

            <div className="side-title-row" style={{ marginTop: 12 }}>
              <h3>Actions</h3>
              <button type="button" className="ghost-btn" onClick={addAction}>
                <Plus size={14} /> إضافة
              </button>
            </div>

            {(selected.actions ?? []).map((action, idx) => (
              <div key={action.id} className="action-card">
                <label className="field">
                  Label
                  <input
                    value={action.label}
                    onChange={(e) => {
                      const actions = [...(selected.actions ?? [])]
                      actions[idx] = { ...action, label: e.target.value }
                      updateSelected({ ...selected, actions })
                    }}
                  />
                </label>
                <label className="field">
                  Type
                  <select
                    value={action.type}
                    onChange={(e) => {
                      const actions = [...(selected.actions ?? [])]
                      actions[idx] = { ...action, type: e.target.value }
                      updateSelected({ ...selected, actions })
                    }}
                  >
                    <option value="alert">alert</option>
                    <option value="scroll">scroll</option>
                    <option value="navigate">navigate</option>
                    <option value="custom">custom</option>
                  </select>
                </label>
                <label className="field">
                  Target / Payload
                  <input
                    value={action.target ?? action.payload ?? ''}
                    onChange={(e) => {
                      const actions = [...(selected.actions ?? [])]
                      actions[idx] = {
                        ...action,
                        target: e.target.value,
                        payload: e.target.value,
                      }
                      updateSelected({ ...selected, actions })
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

export function createDefaultComponent(type: string, id: string): UiComponent {
  switch (type) {
    case 'navbar':
      return {
        id,
        type,
        props: { brand: 'Brand', links: ['الرئيسية', 'حول', 'تواصل'] },
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
    case 'hero':
      return {
        id,
        type,
        props: {
          eyebrow: 'New',
          title: 'عنوان جديد',
          subtitle: 'وصف قصير للقسم',
          ctaLabel: 'ابدأ',
          align: 'center',
        },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'ابدأ', payload: 'Hero action' }],
      }
    case 'features':
      return {
        id,
        type,
        props: {
          title: 'مميزات',
          items: [
            { title: 'سرعة', desc: 'وصف' },
            { title: 'مرونة', desc: 'وصف' },
            { title: 'تصميم', desc: 'وصف' },
          ],
        },
      }
    case 'cards':
      return {
        id,
        type,
        props: {
          title: 'كروت',
          items: [
            { title: 'بطاقة 1', desc: 'تفاصيل' },
            { title: 'بطاقة 2', desc: 'تفاصيل' },
          ],
        },
      }
    case 'stats':
      return {
        id,
        type,
        props: {
          source: 'api',
          title: 'إحصائيات',
          items: [],
        },
      }
    case 'chart':
      return {
        id,
        type,
        props: {
          source: 'api',
          title: 'المبيعات',
        },
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
        actions: [{ id: `${id}-a`, type: 'alert', label: 'إرسال', payload: 'تم الإرسال' }],
      }
    case 'cta':
      return {
        id,
        type,
        props: { title: 'جاهز تبدأ؟', subtitle: 'خطوة واحدة تفصل بينك وبين الإطلاق', buttonLabel: 'انطلق' },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'انطلق', payload: 'CTA' }],
      }
    case 'footer':
      return {
        id,
        type,
        props: { text: '© AI UI Builder', links: ['خصوصية', 'شروط'] },
      }
    case 'button':
      return {
        id,
        type,
        props: { label: 'زر مخصص' },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'زر مخصص', payload: 'clicked' }],
      }
    case 'image':
      return {
        id,
        type,
        props: { alt: 'صورة', caption: 'ارفع صورة', src: '' },
      }
    case 'stack':
      return {
        id,
        type,
        props: {
          title: 'بطاقة',
          subtitle: 'محتوى مخصص',
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
    case 'search':
      return {
        id,
        type,
        props: {
          title: 'بحث',
          subtitle: 'نتائج من الـ API',
          placeholder: 'ابحث...',
        },
      }
    case 'select':
      return {
        id,
        type,
        props: {
          title: 'اختيار واحد',
          placeholder: 'اختر...',
          options: [
            { value: 'a', label: 'خيار أ' },
            { value: 'b', label: 'خيار ب' },
          ],
        },
      }
    case 'dropdown':
      return {
        id,
        type,
        props: {
          title: 'دروب داون',
          placeholder: 'افتح...',
          source: 'api',
          subtitle: 'الخيارات من /api/demo/options',
          options: [],
        },
      }
    case 'multiselect':
      return {
        id,
        type,
        props: {
          title: 'اختيار متعدد',
          options: [
            { value: 'x', label: 'واحد' },
            { value: 'y', label: 'اثنين' },
            { value: 'z', label: 'ثلاثة' },
          ],
        },
      }
    case 'colorpicker':
      return {
        id,
        type,
        props: {
          title: 'Color picker',
          subtitle: 'اختاري لون',
          label: 'اللون',
          value: '#0F766E',
        },
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
        props: {
          title: 'Time picker',
          subtitle: 'اختاري وقت',
          label: 'الوقت',
          value: '09:30',
        },
      }
    case 'usercard':
      return {
        id,
        type,
        props: {
          userId: 'u1',
          name: 'سارة خالد',
          role: 'مصممة UI',
          city: 'عمّان',
          bio: 'تحب المنتجات الرقمية',
          tags: ['design', 'ui'],
        },
      }
    case 'login':
      return {
        id,
        type,
        props: {
          title: 'تسجيل الدخول',
          emailLabel: 'البريد',
          passwordLabel: 'كلمة المرور',
          submitLabel: 'دخول',
          showSignup: true,
          signupLabel: 'إنشاء حساب',
        },
        actions: [
          { id: `${id}-a`, type: 'alert', label: 'دخول', payload: 'login' },
          { id: `${id}-b`, type: 'alert', label: 'إنشاء حساب', payload: 'signup' },
        ],
      }
    case 'profile':
      return {
        id,
        type,
        props: {
          name: 'مستخدم',
          meta: 'المدينة · المهنة',
          bio: 'نبذة قصيرة',
          friends: '100',
          posts: '20',
          photos: '8',
          coverLabel: 'صورة الغلاف',
          ctaLabel: 'تعديل الملف',
        },
        actions: [{ id: `${id}-a`, type: 'alert', label: 'تعديل', payload: 'edit profile' }],
      }
    case 'feed':
      return {
        id,
        type,
        props: {
          title: 'المنشورات',
          composerPlaceholder: 'بماذا تفكر؟',
          posts: [
            {
              author: 'أحمد',
              time: 'الآن',
              text: 'منشور تجريبي',
              likes: '10',
              comments: '2',
              shares: '1',
            },
          ],
        },
        actions: [
          { id: `${id}-a`, type: 'alert', label: 'نشر', payload: 'posted' },
          { id: `${id}-b`, type: 'alert', label: 'إعجاب', payload: 'liked' },
          { id: `${id}-c`, type: 'alert', label: 'تعليق', payload: 'comment' },
          { id: `${id}-d`, type: 'alert', label: 'مشاركة', payload: 'share' },
        ],
      }
    default:
      return {
        id,
        type: 'text',
        props: { title: 'نص', text: 'محتوى قابل للتعديل' },
      }
  }
}
