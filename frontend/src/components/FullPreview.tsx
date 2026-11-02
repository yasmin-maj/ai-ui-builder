import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { UiAction, UiPage } from '../types'
import { PreviewRenderer, type PreviewDevice } from './PreviewRenderer'

type Props = {
  page: UiPage
  device?: PreviewDevice
  onClose: () => void
  onAction?: (action: UiAction) => void
  onNotify?: (message: string) => void
}

export function FullPreview({ page, device = 'desktop', onClose, onAction, onNotify }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="full-preview" role="dialog" aria-modal="true" aria-label="معاينة الصفحة">
      <div className="full-preview-bar">
        <div>
          <strong>معاينة الصفحة</strong>
          <span>{page.title || 'بدون عنوان'}</span>
        </div>
        <button type="button" className="primary-btn" onClick={onClose}>
          <X size={16} />
          إغلاق
        </button>
      </div>
      <div className={`full-preview-scroll device-${device}`}>
        <PreviewRenderer
          page={page}
          device={device}
          onNotify={onNotify}
          onAction={(action) => {
            if ((action.type === 'scroll' || action.type === 'navigate') && action.target?.startsWith('#')) {
              document
                .querySelector(`.full-preview-scroll ${action.target}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              return
            }
            onAction?.(action)
          }}
        />
      </div>
    </div>
  )
}
