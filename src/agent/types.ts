import type { Store } from './store.js'

// Shapes shared by the server, the browser and the eval runner.

/** Gemini conversation history, kept by the client and sent back verbatim (it carries the model's
 *  thought signatures, which Gemini 3 needs to continue a tool-calling turn). */
export type History = { role: 'user' | 'model'; parts: Record<string, unknown>[] }[]

export interface Call {
  id?: string
  name: string
  args: Record<string, unknown>
}

/** A tool call waiting for a human, plus what's needed to resume the turn exactly where it stopped. */
export interface Pending {
  call: Call
  summary: string
  /** Responses already computed for calls earlier in the same model turn. */
  responses: Record<string, unknown>[]
  /** Calls later in the same model turn, not run yet. */
  remaining: Call[]
}

export interface TurnRequest {
  history: History
  store: Store
  message?: string
  pending?: Pending
  approved?: boolean
}

export interface Usage {
  input: number
  output: number
  thinking: number
}

export type AgentEvent =
  | { type: 'model'; step: number; model: string; ms: number; usage: Usage; text: string; calls: Call[] }
  | { type: 'tool'; step: number; call: Call; result: Record<string, unknown>; ms: number; approval?: 'approved' | 'denied' }
  | { type: 'approval'; pending: Pending }
  | { type: 'reply'; text: string }
  | { type: 'done'; history: History; store: Store; stop: 'reply' | 'approval' | 'max_steps'; steps: number; ms: number; usage: Usage }
  | { type: 'error'; message: string }
