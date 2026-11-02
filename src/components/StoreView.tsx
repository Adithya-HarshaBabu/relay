import { orderTotal, refunded, seedStore, type Store } from '../agent/store'

// The sandbox the agent works on. Anything it changes (refunds, addresses, escalations) is
// highlighted against the original data.

export default function StoreView({ store }: { store: Store }) {
  const seed = seedStore()
  const original = new Map(seed.orders.map((o) => [o.id, o]))

  return (
    <div className="store">
      <p className="note">Your private sandbox, reset any time. Today in the store is {store.today}.</p>

      {store.escalations.length > 0 && (
        <>
          <h3>Escalations</h3>
          <ul className="esc">
            {store.escalations.map((e) => (
              <li key={e.id} className="changed">
                <strong>{e.id}</strong> <span className={`pill ${e.priority}`}>{e.priority}</span> {e.orderId && <code>{e.orderId}</code>} {e.summary}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Orders</h3>
      <div className="orders">
        {store.orders.map((o) => {
          const before = original.get(o.id)
          const newRefunds = o.refunds.slice(before?.refunds.length ?? 0)
          const moved = before && before.address !== o.address
          const customer = store.customers.find((c) => c.id === o.customerId)
          return (
            <article key={o.id} className={`order ${newRefunds.length || moved ? 'changed' : ''}`}>
              <div className="order-head">
                <strong>{o.id}</strong>
                <span className={`status ${o.status}`}>{o.status}</span>
                <span className="muted">${orderTotal(o).toFixed(2)}</span>
              </div>
              <p className="muted">
                {customer?.name} · {customer?.email}
              </p>
              <p>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
              <p className={`muted ${moved ? 'hl' : ''}`}>{o.address}</p>
              {o.refunds.length > 0 && (
                <p className="refunds">
                  Refunded ${refunded(o).toFixed(2)}:{' '}
                  {o.refunds.map((r, i) => (
                    <span key={i} className={i >= (before?.refunds.length ?? 0) ? 'hl' : ''}>
                      ${r.amount} {r.reason.toLowerCase()} ({r.approvedBy === 'human' ? 'approved by supervisor' : 'within agent limit'}){i < o.refunds.length - 1 ? '; ' : ''}
                    </span>
                  ))}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
