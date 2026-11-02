import { useRef, useState, type MouseEvent } from 'react'
import { api } from '../api'

export function ImageUploadSlot({
  src,
  alt,
  caption,
  tall,
  onUploaded,
  onNotify,
}: {
  src: string
  alt: string
  caption: string
  tall?: boolean
  onUploaded: (url: string, fileName: string) => void
  onNotify?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = (e: MouseEvent) => {
    e.stopPropagation()
    inputRef.current?.click()
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      const res = await api.uploadImage(file)
      onUploaded(res.url, file.name)
      onNotify?.('تم رفع الصورة')
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'فشل رفع الصورة')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`ui-image-slot ${tall ? 'tall' : ''} ${busy ? 'busy' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      {src ? (
        <button type="button" className="ui-image-fig clickable" onClick={pick} title="غيّر الصورة">
          <img src={src} alt={alt} />
          {caption && <figcaption>{caption}</figcaption>}
          <span className="ui-image-change">{busy ? 'عم نرفع…' : 'تغيير الصورة'}</span>
        </button>
      ) : (
        <button type="button" className={`ui-image-ph ${tall ? 'tall' : ''}`} onClick={pick}>
          <span>{busy ? 'عم نرفع…' : caption || 'اضغط لرفع صورة'}</span>
        </button>
      )}
    </div>
  )
}
