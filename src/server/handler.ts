import { runTurn } from '../agent/loop.js'
import type { AgentEvent, TurnRequest } from '../agent/types.js'

// POST /api/agent → the turn's events as newline-delimited JSON, streamed as they happen.
// Shared by the Vercel Function and the Vite dev server.

const MAX_BODY = 256_000
const MAX_MESSAGE = 1_000
const MAX_HISTORY = 80

// Best-effort abuse protection for a public demo: per-IP limits held in memory per instance.
const hits = new Map<string, number[]>()
function rateLimited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  if (recent.filter((t) => now - t < 60_000).length >= 10 || recent.length >= 100) return true
  hits.set(ip, [...recent, now])
  return false
}

function parse(raw: string): TurnRequest | string {
  if (raw.length > MAX_BODY) return 'This conversation is too long for the demo. Start a new one.'
  let body: Partial<TurnRequest>
  try {
    body = JSON.parse(raw)
  } catch {
    return 'Bad request.'
  }
  if (!Array.isArray(body.history)) return 'Bad request.'
  if (body.history.length > MAX_HISTORY) return 'This conversation is too long for the demo. Start a new one.'
  if (!body.store || !Array.isArray(body.store.orders) || !Array.isArray(body.store.customers) || typeof body.store.today !== 'string') return 'Bad request.'
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!body.pending && !message) return 'Type a message first.'
  if (message.length > MAX_MESSAGE) return `Keep messages under ${MAX_MESSAGE} characters.`
  return { history: body.history, store: body.store, message: message || undefined, pending: body.pending, approved: body.approved === true }
}

export async function handleAgent(raw: string, ip: string, env: { apiKey?: string; model?: string }): Promise<Response> {
  const json = (status: number, error: string) => Response.json({ error }, { status })
  if (!env.apiKey) return json(503, 'AI is not configured on this server (GEMINI_API_KEY is missing).')
  const req = parse(raw)
  if (typeof req === 'string') return json(400, req)
  if (rateLimited(ip)) return json(429, 'You’re going a bit fast for the demo. Try again in a minute.')

  const encoder = new TextEncoder()
  const events = runTurn(req, { apiKey: env.apiKey, model: env.model })
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))

  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await events.next()
          if (done) controller.close()
          else send(controller, value)
        } catch (error) {
          const message = String(error)
          send(controller, {
            type: 'error',
            message: /API key|PERMISSION_DENIED|quota|RESOURCE_EXHAUSTED/i.test(message)
              ? 'The AI service rejected the request. Check the server’s Gemini key and quota.'
              : 'Gemini is busy or timed out. Try sending that again.',
          })
          controller.close()
        }
      },
      cancel() {
        void events.return(undefined)
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  )
}
