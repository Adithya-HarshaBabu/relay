import { useCallback, useRef, useState } from 'react'
import { seedStore, type Store } from './agent/store'
import type { AgentEvent, History, Pending } from './agent/types'

// Client side of a conversation: keeps the history and store sandbox, sends turns to /api/agent
// and folds the streamed events into chat messages and a per-turn trace.

export interface ChatMessage {
  from: 'customer' | 'agent' | 'system'
  text: string
}

export interface Turn {
  id: number
  label: string
  events: AgentEvent[]
}

export function useAgent() {
  const [store, setStore] = useState<Store>(() => seedStore())
  const [history, setHistory] = useState<History>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const turnId = useRef(0)

  const run = useCallback(
    async (body: { message?: string; pending?: Pending; approved?: boolean }, label: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const id = ++turnId.current
      setTurns((t) => [...t, { id, label, events: [] }])
      setRunning(true)
      setError(null)
      setPending(null)
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history, store, ...body }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `Request failed (${res.status})`)
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            const event = JSON.parse(line) as AgentEvent
            setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, events: [...turn.events, event] } : turn)))
            if (event.type === 'reply') setMessages((m) => [...m, { from: 'agent', text: event.text }])
            if (event.type === 'approval') setPending(event.pending)
            if (event.type === 'error') setError(event.message)
            if (event.type === 'done') {
              setHistory(event.history)
              setStore(event.store)
            }
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Something went wrong.')
      } finally {
        if (abortRef.current === controller) setRunning(false)
      }
    },
    [history, store],
  )

  const send = useCallback(
    (text: string) => {
      setMessages((m) => [...m, { from: 'customer', text }])
      void run({ message: text }, text)
    },
    [run],
  )

  const decide = useCallback(
    (approved: boolean) => {
      if (!pending) return
      setMessages((m) => [...m, { from: 'system', text: `Supervisor ${approved ? 'approved' : 'declined'}: ${pending.summary}` }])
      void run({ pending, approved }, approved ? 'Supervisor approved' : 'Supervisor declined')
    },
    [pending, run],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStore(seedStore())
    setHistory([])
    setMessages([])
    setTurns([])
    setPending(null)
    setRunning(false)
    setError(null)
  }, [])

  return { store, messages, turns, pending, running, error, send, decide, reset, clearError: () => setError(null) }
}
