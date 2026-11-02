import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type AskOptions = {
  title: string
  label?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  placeholder?: string
  inputType?: 'text' | 'number'
  min?: number
  max?: number
  confirm?: boolean
}

type AskFn = (options: AskOptions) => Promise<string | null>

const PromptContext = createContext<AskFn | null>(null)

export function useAskPrompt(): AskFn {
  const ask = useContext(PromptContext)
  if (!ask) {
    return async (options) => window.prompt(options.label || options.title, options.defaultValue ?? '')
  }
  return ask
}

export function NicePromptProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<AskOptions | null>(null)
  const [value, setValue] = useState('')
  const resolver = useRef<((v: string | null) => void) | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const openedAt = useRef(0)

  const ask = useCallback<AskFn>((opts) => {
    openedAt.current = Date.now()
    setOptions(opts)
    setValue(opts.defaultValue ?? '')
    setOpen(true)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const close = (result: string | null) => {
    setOpen(false)
    resolver.current?.(result)
    resolver.current = undefined
  }

  const submit = () => {
    if (options?.confirm) {
      close('ok')
      return
    }
    const trimmed = value.trim()
    if (!trimmed && options?.inputType !== 'number') {
      close(null)
      return
    }
    close(trimmed || value)
  }

  return (
    <PromptContext.Provider value={ask}>
      {children}
      {open && options && (
        <div
          className="nice-prompt-overlay"
          role="presentation"
          onClick={() => {
            if (Date.now() - openedAt.current < 400) return
            if (options.confirm) return
            close(null)
          }}
        >
          <div
            className="nice-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nice-prompt-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="nice-prompt-title">{options.title}</h3>
            {options.label && <p className="nice-prompt-label">{options.label}</p>}
            {!options.confirm && (
              <input
                ref={inputRef}
                type={options.inputType ?? 'text'}
                min={options.min}
                max={options.max}
                value={value}
                placeholder={options.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    close(null)
                  }
                }}
              />
            )}
            <div className="nice-prompt-actions">
              <button type="button" className="ghost-btn" onClick={() => close(null)}>
                {options.cancelLabel ?? 'إلغاء'}
              </button>
              <button
                type="button"
                className={options.confirm ? 'danger-btn' : 'primary-btn'}
                onClick={submit}
              >
                {options.confirmLabel ?? 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PromptContext.Provider>
  )
}
