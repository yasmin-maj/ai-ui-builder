import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react'

const WEEKDAYS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function displayDate(value: string) {
  const d = parseDate(value)
  if (!d) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function MatDateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const selected = parseDate(value)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => selected ?? new Date())
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = first.getDay()
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const grid: Array<Date | null> = []
    for (let i = 0; i < start; i++) grid.push(null)
    for (let d = 1; d <= days; d++) grid.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    while (grid.length % 7 !== 0) grid.push(null)
    return grid
  }, [cursor])

  const today = new Date()

  return (
    <div className="mat-field" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <span className="mat-label">{label}</span>
      <button type="button" className={`mat-outline ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)}>
        <span className={value ? '' : 'mat-placeholder'}>{value ? displayDate(value) : 'يوم/شهر/سنة'}</span>
        <Calendar size={18} />
      </button>
      {open && (
        <div className="mat-overlay mat-calendar" role="dialog">
          <div className="mat-cal-head">
            <button type="button" aria-label="الشهر السابق" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronRight size={18} />
            </button>
            <strong>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </strong>
            <button type="button" aria-label="الشهر التالي" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="mat-cal-grid mat-cal-week">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mat-cal-grid">
            {cells.map((d, i) => {
              if (!d) return <span key={`e-${i}`} />
              const iso = formatDate(d)
              const isSelected = value === iso
              const isToday = d.toDateString() === today.toDateString()
              return (
                <button
                  key={iso}
                  type="button"
                  className={`mat-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => {
                    onChange(iso)
                    setOpen(false)
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function parseTime(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  let h = m ? Number(m[1]) : 9
  const min = m ? Number(m[2]) : 0
  if (h > 23) h = 9
  const pm = h >= 12
  const h12 = h % 12 || 12
  return { h24: h, minute: Math.min(59, Math.max(0, min)), pm, h12 }
}

export function MatTimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const parsed = parseTime(value || '09:30')
  const [open, setOpen] = useState(false)
  const [face, setFace] = useState<'hour' | 'minute'>('hour')
  const [pm, setPm] = useState(parsed.pm)
  const [h12, setH12] = useState(parsed.h12)
  const [minute, setMinute] = useState(parsed.minute)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const next = parseTime(value || '09:30')
    setPm(next.pm)
    setH12(next.h12)
    setMinute(next.minute)
    setFace('hour')
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open, value])

  const apply = (nextH12 = h12, nextMin = minute, nextPm = pm) => {
    let h = nextH12 % 12
    if (nextPm) h += 12
    onChange(`${pad(h)}:${pad(nextMin)}`)
  }

  const numbers = face === 'hour' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
  const active = face === 'hour' ? h12 : Math.round(minute / 5) * 5

  return (
    <div className="mat-field" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <span className="mat-label">{label}</span>
      <button type="button" className={`mat-outline ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)}>
        <span className={value ? '' : 'mat-placeholder'}>{value || '--:--'}</span>
        <Clock size={18} />
      </button>
      {open && (
        <div className="mat-overlay mat-time" role="dialog">
          <div className="mat-time-display">
            <button type="button" className={face === 'hour' ? 'on' : ''} onClick={() => setFace('hour')}>
              {pad(h12)}
            </button>
            <span>:</span>
            <button type="button" className={face === 'minute' ? 'on' : ''} onClick={() => setFace('minute')}>
              {pad(minute)}
            </button>
            <div className="mat-ampm">
              <button type="button" className={!pm ? 'on' : ''} onClick={() => { setPm(false); apply(h12, minute, false) }}>
                ص
              </button>
              <button type="button" className={pm ? 'on' : ''} onClick={() => { setPm(true); apply(h12, minute, true) }}>
                م
              </button>
            </div>
          </div>
          <div className="mat-clock">
            {numbers.map((n, i) => {
              const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
              const x = 50 + Math.cos(angle) * 38
              const y = 50 + Math.sin(angle) * 38
              const selected = n === active || (face === 'hour' && n === 12 && h12 === 12)
              return (
                <button
                  key={`${face}-${n}`}
                  type="button"
                  className={selected ? 'selected' : ''}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => {
                    if (face === 'hour') {
                      setH12(n)
                      apply(n, minute, pm)
                      setFace('minute')
                    } else {
                      setMinute(n)
                      apply(h12, n, pm)
                    }
                  }}
                >
                  {pad(n)}
                </button>
              )
            })}
          </div>
          <div className="mat-time-actions">
            <button type="button" className="ghost-btn" onClick={() => setOpen(false)}>
              إلغاء
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                apply()
                setOpen(false)
              }}
            >
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
