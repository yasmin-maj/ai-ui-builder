import { Mic, MicOff, Send, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'

type Props = {
  messages: ChatMessage[]
  busy: boolean
  onSend: (text: string) => void
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
    SpeechRecognition?: new () => SpeechRecognitionLike
  }
}

export function ChatPanel({ messages, busy, onSend }: Props) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceHint, setVoiceHint] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) {
      setVoiceHint('المتصفح ما بيدعم الفويس — استخدم Chrome')
      return
    }
    const rec = new Ctor()
    rec.lang = 'ar-SA'
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(' ')
      setText(transcript)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
  }, [])

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    onSend(value)
    setText('')
  }

  const toggleVoice = () => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
      return
    }
    setListening(true)
    rec.start()
  }

  return (
    <aside className="panel chat-panel">
      <header className="panel-head">
        <Sparkles size={18} />
        <div>
          <h2>AI Agent</h2>
          <p>اكتب أو احكي متطلباتك</p>
        </div>
      </header>

      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble assistant thinking">عم ببني الواجهة…</div>}
      </div>

      <div className="chat-composer">
        {voiceHint && <small className="hint">{voiceHint}</small>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="كمّلي الحكي عادي… مثال: ضيف لوجين / غيّر اللون لأزرق / أضف بوستات. لبداية جديدة: من الصفر"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="composer-actions">
          <button
            type="button"
            className={`icon-btn ${listening ? 'live' : ''}`}
            onClick={toggleVoice}
            title="Voice"
            disabled={!!voiceHint}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button type="button" className="primary-btn" onClick={submit} disabled={busy || !text.trim()}>
            <Send size={16} />
            إرسال
          </button>
        </div>
      </div>
    </aside>
  )
}
