import { useEffect, useRef } from 'react'
import type { AgentEvent, Call } from '../agent/types'
import type { Turn } from '../useAgent'

// Every step the agent takes, as it happens: what the model decided, which tools ran with which
// arguments, what they returned, how long each took and how many tokens it cost.

export default function Trace({ turns, running }: { turns: Turn[]; running: boolean }) {
  const listRef = useRef<HTMLDivElement>(null)
  const count = turns.reduce((n, t) => n + t.events.length, 0)
  // Scroll the panel, not the page, as steps arrive.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  if (!turns.length) {
    return (
      <div className="trace empty-trace">
        <p>Each step the agent takes shows up here live: the model’s decision, every tool call with its arguments and result, timing and token use.</p>
        <ul>
          <li>🔒 Hard rules live in the tools, not just the prompt: ownership checks, the 30-day window, refund ceilings.</li>
          <li>🙋 Refunds over $100 stop for a human to approve.</li>
          <li>🧪 The same scenarios are graded automatically on the Evals tab.</li>
        </ul>
      </div>
    )
  }

  return (
    <div className="trace" ref={listRef}>
      {turns.map((turn, i) => (
        <section key={turn.id} className="turn">
          <h3>
            <span className="turn-n">Turn {i + 1}</span> {turn.label}
          </h3>
          <ol>
            {turn.events.map((e, j) => (
              <EventRow key={j} event={e} />
            ))}
            {running && i === turns.length - 1 && <li className="ev thinking">Waiting for the model…</li>}
          </ol>
        </section>
      ))}
    </div>
  )
}

function EventRow({ event: e }: { event: AgentEvent }) {
  switch (e.type) {
    case 'model':
      return (
        <li className="ev model">
          <div className="ev-head">
            <span className="kind">🧠 Model · step {e.step}</span>
            <span className="meta">
              {e.model} · {ms(e.ms)} · {e.usage.input.toLocaleString()} in / {(e.usage.output + e.usage.thinking).toLocaleString()} out tok
            </span>
          </div>
          {e.calls.length > 0 ? (
            <p className="decision">Calls {e.calls.map((c) => <code key={c.id ?? c.name}>{c.name}</code>).reduce<React.ReactNode[]>((acc, el, k) => (k ? [...acc, ', ', el] : [el]), [])}</p>
          ) : (
            <p className="decision">Writes the reply</p>
          )}
        </li>
      )
    case 'tool':
      return (
        <li className={`ev tool ${'error' in e.result ? 'failed' : ''}`}>
          <div className="ev-head">
            <span className="kind">🛠 {e.call.name}</span>
            <span className="meta">
              {e.approval && <span className={`pill ${e.approval}`}>{e.approval === 'approved' ? 'human approved' : 'human declined'}</span>}
              {ms(e.ms)}
            </span>
          </div>
          <Args call={e.call} />
          <details>
            <summary>{'error' in e.result ? `Refused: ${String(e.result.error)}` : summarize(e.result)}</summary>
            <pre>{JSON.stringify(e.result, null, 2)}</pre>
          </details>
        </li>
      )
    case 'approval':
      return (
        <li className="ev pause">
          <div className="ev-head">
            <span className="kind">⏸ Paused for approval</span>
          </div>
          <p>{e.pending.summary}</p>
        </li>
      )
    case 'reply':
      return null
    case 'done':
      return (
        <li className="ev done">
          {e.stop === 'approval' ? 'Waiting for a human' : e.stop === 'max_steps' ? 'Stopped at the step limit' : 'Replied'} · {e.steps} model call{e.steps === 1 ? '' : 's'} · {ms(e.ms)} ·{' '}
          {(e.usage.input + e.usage.output + e.usage.thinking).toLocaleString()} tokens
        </li>
      )
    case 'error':
      return <li className="ev failed">⚠️ {e.message}</li>
  }
}

function Args({ call }: { call: Call }) {
  const entries = Object.entries(call.args)
  if (!entries.length) return null
  return (
    <dl className="args">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function summarize(r: Record<string, unknown>): string {
  if (typeof r.status === 'string') return `Result: ${r.status}`
  if (Array.isArray(r.results)) return `${r.results.length} policy section${r.results.length === 1 ? '' : 's'}`
  if (r.customer) return `Found customer, ${(r.orders as unknown[]).length} orders`
  if (r.order_id) return `Order ${r.order_id}`
  return 'Result'
}

const ms = (n: number) => (n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`)
