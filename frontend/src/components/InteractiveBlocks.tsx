import { useEffect, useState, type CSSProperties } from 'react'
import { api, type DemoChart, type DemoOption, type DemoStat, type DemoUser } from '../api'
import { MatDateField, MatTimeField } from './AngularPickers'

type Box = CSSProperties | undefined

type Notify = (message: string) => void

export function SearchBlock({
  props,
  boxStyle,
  onNotify,
}: {
  props: Record<string, unknown>
  boxStyle?: Box
  onNotify?: Notify
}) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DemoUser[]>([])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const res = await api.searchUsers(q)
          setResults(res.results)
        } catch {
          onNotify?.('فشل البحث من السيرفر')
        } finally {
          setLoading(false)
        }
      })()
    }, 250)
    return () => window.clearTimeout(t)
  }, [q, onNotify])

  return (
    <div className="ui-section ui-interactive" style={boxStyle}>
      <h2>{String(props.title ?? 'بحث')}</h2>
      <p>{String(props.subtitle ?? 'ابحث بالاسم أو المدينة أو التخصص — النتائج من الـ API')}</p>
      <input
        className="ui-search-input"
        value={q}
        placeholder={String(props.placeholder ?? 'اكتب للبحث...')}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ui-search-meta">{loading ? 'عم يبحث…' : `${results.length} نتيجة`}</div>
      <div className="ui-user-grid">
        {results.map((u) => (
          <UserCardView key={u.id} user={u} onNotify={onNotify} />
        ))}
      </div>
    </div>
  )
}

export function SelectBlock({
  mode,
  props,
  boxStyle,
  componentId,
  onNotify,
}: {
  mode: 'select' | 'dropdown' | 'multiselect'
  props: Record<string, unknown>
  boxStyle?: Box
  componentId: string
  onNotify?: Notify
}) {
  const fromApi = props.source === 'api' || Boolean(String(props.apiUrl ?? '').trim())
  const apiUrl = String(props.apiUrl ?? '').trim() || (fromApi ? '/api/demo/options' : '')
  const staticOptions = Array.isArray(props.options)
    ? (props.options as Array<string | { value?: string; label?: string }>).map((o) =>
        typeof o === 'string'
          ? { value: o, label: o }
          : { value: String(o.value ?? o.label ?? ''), label: String(o.label ?? o.value ?? '') },
      )
    : []
  const [options, setOptions] = useState<DemoOption[]>(fromApi ? [] : staticOptions)
  const [value, setValue] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!apiUrl) return
    let cancelled = false
    void api
      .fetchJson(apiUrl)
      .then((data) => {
        if (!cancelled) setOptions(asOptions(data))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [apiUrl])

  const save = async (next: string[]) => {
    setSaving(true)
    try {
      const res = await api.saveSelect({
        kind: mode,
        values: next,
        label: String(props.title ?? mode),
        componentId,
      })
      onNotify?.(res.message)
    } catch {
      onNotify?.('فشل حفظ الاختيار على السيرفر')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ui-section ui-interactive" style={boxStyle}>
      <h2>{String(props.title ?? (mode === 'multiselect' ? 'اختيار متعدد' : mode === 'dropdown' ? 'دروب داون' : 'اختيار واحد'))}</h2>
      <p>{String(props.subtitle ?? 'الاختيار بينحفظ على الـ backend')}</p>

      {mode === 'multiselect' ? (
        <div className="ui-multi">
          {options.map((o) => {
            const checked = values.includes(o.value)
            return (
              <label key={o.value} className={`ui-chip ${checked ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked ? values.filter((v) => v !== o.value) : [...values, o.value]
                    setValues(next)
                    void save(next)
                  }}
                />
                {o.label}
              </label>
            )
          })}
        </div>
      ) : (
        <select
          className="ui-select"
          value={value}
          onChange={(e) => {
            const next = e.target.value
            setValue(next)
            void save(next ? [next] : [])
          }}
        >
          <option value="">{String(props.placeholder ?? 'اختر...')}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      <div className="ui-search-meta">
        {saving
          ? 'عم يحفظ…'
          : mode === 'multiselect'
            ? `المحدد: ${values.length ? values.join(', ') : 'لا شيء'}`
            : `المحدد: ${value || 'لا شيء'}`}
      </div>
    </div>
  )
}

export function PickerBlock({
  kind,
  props,
  boxStyle,
  componentId,
  onNotify,
}: {
  kind: 'color' | 'date' | 'time'
  props: Record<string, unknown>
  boxStyle?: Box
  componentId: string
  onNotify?: Notify
}) {
  const fallback = kind === 'color' ? '#0F766E' : kind === 'date' ? '' : '09:30'
  const [value, setValue] = useState(String(props.value ?? fallback))
  const [saving, setSaving] = useState(false)

  const persist = async (next: string) => {
    setValue(next)
    setSaving(true)
    try {
      const res = await api.saveSelect({
        kind: `${kind}picker`,
        values: [next],
        label: String(props.label ?? kind),
        componentId,
      })
      onNotify?.(res.message || `${kind}: ${next}`)
    } catch {
      onNotify?.(`تم اختيار ${next} (محلياً)`)
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel = String(props.label ?? (kind === 'color' ? 'اللون' : kind === 'date' ? 'التاريخ' : 'الوقت'))

  return (
    <div className="ui-section ui-interactive ui-picker" style={boxStyle}>
      <h2>{String(props.title ?? `${kind} picker`)}</h2>
      <p>{String(props.subtitle ?? '')}</p>
      {kind === 'date' ? (
        <MatDateField label={fieldLabel} value={value} onChange={(next) => void persist(next)} />
      ) : kind === 'time' ? (
        <MatTimeField label={fieldLabel} value={value || '09:30'} onChange={(next) => void persist(next)} />
      ) : (
        <label className="ui-picker-label">
          <span>{fieldLabel}</span>
          <div className="ui-picker-row">
            <input
              className="ui-picker-input is-color"
              type="color"
              value={value}
              onChange={(e) => void persist(e.target.value)}
            />
            <code className="ui-picker-value">{value}</code>
          </div>
        </label>
      )}
      <div className="ui-search-meta">{saving ? 'عم يحفظ…' : 'جاهز'}</div>
    </div>
  )
}

export function UserCardBlock({
  props,
  boxStyle,
  onNotify,
}: {
  props: Record<string, unknown>
  boxStyle?: Box
  onNotify?: Notify
}) {
  const user: DemoUser = {
    id: String(props.userId ?? 'u1'),
    name: String(props.name ?? 'مستخدم'),
    role: String(props.role ?? 'Role'),
    city: String(props.city ?? 'City'),
    bio: String(props.bio ?? 'Bio'),
    tags: Array.isArray(props.tags) ? (props.tags as string[]) : ['user'],
  }
  return (
    <div className="ui-section ui-interactive" style={boxStyle}>
      <UserCardView user={user} onNotify={onNotify} />
    </div>
  )
}

function UserCardView({ user, onNotify }: { user: DemoUser; onNotify?: Notify }) {
  return (
    <article
      className="ui-usercard"
      onClick={() => void onNotify?.(`يوزر كارد: ${user.name} · ${user.role}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onNotify?.(`يوزر كارد: ${user.name}`)
      }}
    >
      <div className="ui-avatar">{user.name.slice(0, 1)}</div>
      <div>
        <strong>{user.name}</strong>
        <p>
          {user.role} · {user.city}
        </p>
        <p>{user.bio}</p>
        <div className="ui-tags">
          {user.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </article>
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const record = asRecord(data)
  if (!record) return []
  for (const key of ['items', 'options', 'results', 'stats', 'data', 'points']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  return []
}

function asOptions(data: unknown): DemoOption[] {
  return asList(data).map((item) => {
    if (typeof item === 'string') return { value: item, label: item }
    const row = asRecord(item)
    if (!row) return { value: '', label: '' }
    const value = String(row.value ?? row.Value ?? row.id ?? row.label ?? '')
    const label = String(row.label ?? row.Label ?? row.name ?? value)
    return { value, label }
  }).filter((item) => item.value || item.label)
}

export function StatsBlock({ props, boxStyle }: { props: Record<string, unknown>; boxStyle?: Box }) {
  const fromApi = props.source === 'api' || Boolean(String(props.apiUrl ?? '').trim()) || !Array.isArray(props.items) || props.items.length === 0
  const apiUrl = String(props.apiUrl ?? '').trim() || '/api/demo/stats'
  const fallback: DemoStat[] = Array.isArray(props.items)
    ? (props.items as Array<{ label?: string; value?: string; hint?: string }>).map((item) => ({
        label: String(item.label ?? ''),
        value: String(item.value ?? ''),
        hint: String(item.hint ?? ''),
      }))
    : []
  const [items, setItems] = useState<DemoStat[]>(fromApi ? [] : fallback)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fromApi) return
    void api
      .fetchJson(apiUrl)
      .then((data) => {
        const rows = asList(data).map((item) => {
          const row = asRecord(item) ?? {}
          return {
            label: String(row.label ?? row.Label ?? ''),
            value: String(row.value ?? row.Value ?? ''),
            hint: String(row.hint ?? row.Hint ?? ''),
          }
        })
        setItems(rows)
        setError('')
      })
      .catch(() => setError('ما قدرنا نجيب الإحصائيات من الـ API'))
  }, [fromApi, apiUrl])

  return (
    <div className="ui-stats" style={boxStyle}>
      {error && <p className="ui-section-empty">{error}</p>}
      {!error && items.length === 0 && <p className="ui-section-empty">عم نجيب الأرقام من الباك اند…</p>}
      {items.map((item) => (
        <div key={item.label} className="ui-stat">
          <strong>{item.value}</strong>
          <span>{item.label}</span>
          {item.hint && <small>{item.hint}</small>}
        </div>
      ))}
    </div>
  )
}

export function ChartBlock({ props, boxStyle }: { props: Record<string, unknown>; boxStyle?: Box }) {
  const [chart, setChart] = useState<DemoChart | null>(null)
  const [error, setError] = useState('')

  const apiUrl = String(props.apiUrl ?? '').trim() || '/api/demo/chart'

  useEffect(() => {
    void api
      .fetchJson(apiUrl)
      .then((data) => {
        const record = asRecord(data)
        const points = asList(data).map((item) => {
          const row = asRecord(item) ?? {}
          return {
            label: String(row.label ?? row.Label ?? ''),
            value: Number(row.value ?? row.Value ?? 0),
          }
        })
        setChart({
          title: String(record?.title ?? record?.Title ?? props.title ?? 'Chart'),
          unit: String(record?.unit ?? record?.Unit ?? ''),
          points,
        })
        setError('')
      })
      .catch(() => setError('ما قدرنا نجيب الـ chart من الـ API'))
  }, [apiUrl, props.title])

  const points = chart?.points ?? []
  const max = Math.max(1, ...points.map((p) => p.value))

  return (
    <div className="ui-section ui-chart" style={boxStyle}>
      <h2>{String(props.title ?? chart?.title ?? 'Chart')}</h2>
      <p>{chart ? `من ${apiUrl}${chart.unit ? ` · ${chart.unit}` : ''}` : 'عم نجيب الرسم من الباك اند…'}</p>
      {error && <p className="ui-section-empty">{error}</p>}
      <div className="ui-chart-bars">
        {points.map((point) => (
          <div key={point.label} className="ui-chart-col">
            <span>{point.value}</span>
            <div className="ui-chart-bar" style={{ height: `${Math.round((point.value / max) * 140)}px` }} />
            <small>{point.label}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
