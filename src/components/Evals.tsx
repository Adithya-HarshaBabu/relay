import { useEffect, useState } from 'react'

// Results of `npm run eval`: every scenario run against each model, graded by code checks.

interface ScenarioResult {
  id: string
  title: string
  category: string
  messages: string[]
  pass: boolean
  checks: { label: string; pass: boolean; detail?: string }[]
  tools: string[]
  reply: string
  steps: number
  ms: number
  usage: { input: number; output: number; thinking: number }
  error?: string
}

interface ModelResult {
  model: string
  passed: number
  total: number
  checksPassed: number
  checksTotal: number
  medianMs: number
  avgSteps: number
  avgTokens: number
  scenarios: ScenarioResult[]
}

interface Report {
  runAt: string
  models: ModelResult[]
}

export default function Evals() {
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch('/evals.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setReport)
      .catch(() => setFailed(true))
  }, [])

  if (failed) return <main className="evals"><p>No eval results yet. Run <code>npm run eval</code>.</p></main>
  if (!report) return <main className="evals"><p className="muted">Loading results…</p></main>

  const ids = report.models[0]?.scenarios.map((s) => s.id) ?? []
  const byId = (m: ModelResult, id: string) => m.scenarios.find((s) => s.id === id)!

  return (
    <main className="evals">
      <header className="evals-head">
        <h1>Evals</h1>
        <p>
          {ids.length} scenarios, from happy paths to prompt injection, each a real conversation with the agent. Every check is
          graded in code against what the agent did (tool calls, final store state) and said, so a failure always points at
          something concrete. Supervisor decisions are scripted per scenario.
        </p>
        <p className="muted">
          Run {new Date(report.runAt).toLocaleString()} · <code>npm run eval</code> · free-tier Gemini key, one scenario at a time
        </p>
      </header>

      <div className="model-cards">
        {report.models.map((m) => (
          <article key={m.model} className="model-card">
            <h2>{m.model}</h2>
            <p className="score">
              <strong>{m.passed}/{m.total}</strong> scenarios passed
            </p>
            <dl>
              <div><dt>Checks</dt><dd>{m.checksPassed}/{m.checksTotal}</dd></div>
              <div><dt>Median time</dt><dd>{(m.medianMs / 1000).toFixed(1)} s</dd></div>
              <div><dt>Model calls</dt><dd>{m.avgSteps} avg</dd></div>
              <div><dt>Tokens</dt><dd>{m.avgTokens.toLocaleString()} avg</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <div className="matrix" role="table" aria-label="Scenario results">
        <div className="matrix-row head" role="row">
          <span role="columnheader">Scenario</span>
          {report.models.map((m) => <span key={m.model} role="columnheader">{m.model.replace('gemini-', '')}</span>)}
        </div>
        {ids.map((id) => {
          const first = byId(report.models[0], id)
          return (
            <div key={id} className="matrix-group">
              <button type="button" className="matrix-row" role="row" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
                <span role="cell">
                  <span className="cat">{first.category}</span> {first.title}
                </span>
                {report.models.map((m) => {
                  const s = byId(m, id)
                  return (
                    <span key={m.model} role="cell" className={s.pass ? 'pass' : 'fail'}>
                      {s.pass ? '✓ pass' : `✗ ${s.checks.filter((c) => !c.pass).length} failed`}
                    </span>
                  )
                })}
              </button>
              {open === id && (
                <div className="detail">
                  <blockquote>{first.messages.join(' → ')}</blockquote>
                  <div className="detail-cols">
                    {report.models.map((m) => {
                      const s = byId(m, id)
                      return (
                        <section key={m.model}>
                          <h3>{m.model}</h3>
                          <ul className="checks">
                            {s.checks.map((c) => (
                              <li key={c.label} className={c.pass ? 'pass' : 'fail'}>
                                {c.pass ? '✓' : '✗'} {c.label}
                                {c.detail && <span className="muted"> ({c.detail})</span>}
                              </li>
                            ))}
                          </ul>
                          <p className="muted small">
                            Tools: {s.tools.length ? s.tools.join(' → ') : 'none'} · {s.steps} model calls · {(s.ms / 1000).toFixed(1)} s
                          </p>
                          {s.error ? <p className="fail small">{s.error}</p> : <p className="reply">“{s.reply}”</p>}
                        </section>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
