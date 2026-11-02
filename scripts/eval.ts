import { readFileSync, writeFileSync } from 'node:fs'
import { runTurn } from '../src/agent/loop.js'
import { SCENARIOS, type RunRecord, type Scenario } from '../src/agent/scenarios.js'
import { seedStore, type Store } from '../src/agent/store.js'
import type { Call, History, Usage } from '../src/agent/types.js'

// Runs every scenario against each model and writes public/evals.json for the evals page.
// Usage: npm run eval [-- model1,model2]

const MODELS = (process.argv[2] ?? 'gemini-3.5-flash-lite,gemini-3.8-flash').split(',')
// One at a time: free-tier keys allow only a few requests per minute on some models.
const CONCURRENCY = 1

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const env = readFileSync('.env.local', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)
  if (!env) throw new Error('Set GEMINI_API_KEY or add it to .env.local')
  return env[1].trim()
}

async function runScenario(s: Scenario, model: string, key: string) {
  const before: Store = seedStore(Date.UTC(2026, 10, 2, 12))
  let store = before
  let history: History = []
  const calls: Call[] = []
  const usage: Usage = { input: 0, output: 0, thinking: 0 }
  let reply = ''
  let steps = 0
  let approvalsRequested = 0
  let error: string | undefined
  const t0 = Date.now()
  try {
    for (const message of s.messages) {
      for await (const e of runTurn(
        { history, store, message },
        { apiKey: key, model, fallback: false, patient: true, decide: () => (approvalsRequested++, s.approve ?? false) },
      )) {
        if (e.type === 'tool') calls.push(e.call)
        if (e.type === 'reply') reply = e.text
        if (e.type === 'done') {
          history = e.history
          store = e.store
          steps += e.steps
          usage.input += e.usage.input
          usage.output += e.usage.output
          usage.thinking += e.usage.thinking
        }
      }
    }
  } catch (e) {
    error = String(e).slice(0, 300)
  }
  const record: RunRecord = { calls, reply, before, after: store, approvalsRequested, steps }
  const checks = s.checks.map((c) => {
    if (error) return { label: c.label, pass: false, detail: 'run failed' }
    const r = c.test(record)
    return { label: c.label, pass: r === true, detail: r === true ? undefined : r || 'failed' }
  })
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    messages: s.messages,
    pass: !error && checks.every((c) => c.pass),
    checks,
    tools: calls.map((c) => c.name),
    reply,
    steps,
    ms: Date.now() - t0,
    usage,
    error,
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const key = apiKey()
const results = []
for (const model of MODELS) {
  console.log(`\n${model}`)
  const scenarios = await pool(SCENARIOS, CONCURRENCY, async (s) => {
    const r = await runScenario(s, model, key)
    console.log(`  ${r.pass ? '✓' : '✗'} ${s.title} (${r.steps} steps, ${(r.ms / 1000).toFixed(1)}s)${r.pass ? '' : ' — ' + (r.error ?? r.checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`).join('; '))}`)
    return r
  })
  const n = scenarios.length
  const passed = scenarios.filter((s) => s.pass).length
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  results.push({
    model,
    passed,
    total: n,
    checksPassed: scenarios.reduce((k, s) => k + s.checks.filter((c) => c.pass).length, 0),
    checksTotal: scenarios.reduce((k, s) => k + s.checks.length, 0),
    medianMs: median(scenarios.map((s) => s.ms)),
    avgSteps: Math.round((scenarios.reduce((k, s) => k + s.steps, 0) / n) * 10) / 10,
    avgTokens: Math.round(scenarios.reduce((k, s) => k + s.usage.input + s.usage.output + s.usage.thinking, 0) / n),
    scenarios,
  })
  console.log(`  ${passed}/${n} scenarios passed`)
}

writeFileSync('public/evals.json', JSON.stringify({ runAt: new Date().toISOString(), models: results }, null, 1))
console.log('\nWrote public/evals.json')
