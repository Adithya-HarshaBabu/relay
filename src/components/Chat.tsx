import { useEffect, useRef, useState } from 'react'
import { SCENARIOS } from '../agent/scenarios'
import type { useAgent } from '../useAgent'

// The quick prompts are the eval suite's own opening messages, so what you try here is exactly
// what the evals grade. (The two approval scenarios share a message; here you make the call.)
const PROMPTS = SCENARIOS.filter((s) => s.id !== 'big-refund-denied').map((s) => ({
  label: s.id === 'big-refund-approved' ? 'Refund over $100 (needs approval)' : s.title,
  text: s.messages[0],
}))

export default function Chat({ agent }: { agent: ReturnType<typeof useAgent> }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll the conversation, not the page, as messages arrive.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [agent.messages.length, agent.pending, agent.running, agent.error])

  const submit = (text: string) => {
    if (!text.trim() || agent.running || agent.pending) return
    agent.send(text.trim())
    setDraft('')
  }

  return (
    <div className="chat">
      <div className="messages" aria-live="polite" ref={listRef}>
        {agent.messages.length === 0 && (
          <div className="empty">
            <p>Pick a situation to try, or write your own. Customers are listed under Store data.</p>
            <div className="prompts">
              {PROMPTS.map((p) => (
                <button key={p.label} type="button" onClick={() => submit(p.text)} title={p.text}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {agent.messages.map((m, i) => (
          <div key={i} className={`msg ${m.from}`}>
            {m.from === 'agent' && <span className="who">Relay</span>}
            <p>{m.text}</p>
          </div>
        ))}
        {agent.running && (
          <div className="msg agent typing" aria-label="Relay is working">
            <span className="who">Relay</span>
            <p><span className="dots"><i /><i /><i /></span> working… (see the live trace)</p>
          </div>
        )}
        {agent.pending && (
          <div className="approval" role="alertdialog" aria-label="Supervisor approval">
            <strong>Supervisor approval needed</strong>
            <p>{agent.pending.summary}</p>
            <p className="hint">Refunds over $100 pause here. The agent can’t continue until a person decides.</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => agent.decide(true)}>Approve refund</button>
              <button type="button" className="ghost" onClick={() => agent.decide(false)}>Decline</button>
            </div>
          </div>
        )}
        {agent.error && (
          <div className="error" role="alert">
            <span>{agent.error}</span>
            <button type="button" onClick={agent.clearError} aria-label="Dismiss">✕</button>
          </div>
        )}
      </div>

      {agent.messages.length > 0 && !agent.running && !agent.pending && (
        <div className="prompts compact">
          {PROMPTS.slice(0, 6).map((p) => (
            <button key={p.label} type="button" onClick={() => submit(p.text)} title={p.text}>{p.label}</button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(draft)
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder={agent.pending ? 'Waiting for the supervisor…' : 'Message the support agent…'}
          aria-label="Message"
          disabled={agent.running || !!agent.pending}
        />
        <button type="submit" className="primary" disabled={!draft.trim() || agent.running || !!agent.pending}>Send</button>
      </form>
    </div>
  )
}
