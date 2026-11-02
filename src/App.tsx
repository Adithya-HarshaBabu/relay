import { useEffect, useState } from 'react'
import Chat from './components/Chat'
import Evals from './components/Evals'
import StoreView from './components/StoreView'
import Trace from './components/Trace'
import { seedStore } from './agent/store'
import { useAgent } from './useAgent'

const SEED_REFUNDS = seedStore().orders.reduce((n, o) => n + o.refunds.length, 0)

type Tab = 'trace' | 'store'

function useRoute() {
  const read = () => (location.hash === '#/evals' ? 'evals' : 'agent')
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  const agent = useAgent()
  const [tab, setTab] = useState<Tab>('trace')
  // Refunds and escalations the agent has made in this sandbox.
  const changes = agent.store.orders.reduce((n, o) => n + o.refunds.length, 0) - SEED_REFUNDS + agent.store.escalations.length

  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="brand">
          <Logo /> Relay
        </a>
        <nav>
          <a href="#/" aria-current={route === 'agent' ? 'page' : undefined}>Agent</a>
          <a href="#/evals" aria-current={route === 'evals' ? 'page' : undefined}>Evals</a>
          <a href="https://github.com/Adithya-HarshaBabu/relay">GitHub</a>
        </nav>
      </header>

      {route === 'evals' ? (
        <Evals />
      ) : (
        <main className="workspace">
          <section className="pane chat-pane" aria-label="Customer chat">
            <div className="pane-head">
              <div>
                <h1>Northwind Outfitters support</h1>
                <p>You’re the customer (and, when asked, the supervisor). The agent works the store’s systems through tools.</p>
              </div>
              <button type="button" className="ghost" onClick={agent.reset}>Reset</button>
            </div>
            <Chat agent={agent} />
          </section>
          <section className="pane side-pane" aria-label="Agent internals">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'trace'} onClick={() => setTab('trace')}>
                Live trace
              </button>
              <button type="button" role="tab" aria-selected={tab === 'store'} onClick={() => setTab('store')}>
                Store data {changes > 0 && <span className="badge">{changes}</span>}
              </button>
            </div>
            {tab === 'trace' ? <Trace turns={agent.turns} running={agent.running} /> : <StoreView store={agent.store} />}
          </section>
        </main>
      )}
    </div>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <circle cx="9" cy="16" r="3" fill="#fff" />
      <circle cx="23" cy="9" r="3" fill="#fff" />
      <circle cx="23" cy="23" r="3" fill="#fff" />
      <path d="M12 15l8-5M12 17l8 5" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}
