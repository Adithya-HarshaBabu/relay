import { POLICY, daysBetween, orderTotal, refunded, round2, type Order, type Store } from './store.js'

// Tool declarations (what Gemini sees) and implementations (what actually runs). Hard limits are
// enforced here in code, not only in the prompt: a model that ignores its instructions still can't
// refund someone else's order, exceed the order total or skip human approval.

export const APPROVAL_LIMIT = 100

export interface ToolDeclaration {
  name: string
  description: string
  parametersJsonSchema: Record<string, unknown>
}

const str = (description: string) => ({ type: 'string', description })
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required })
const EMAIL = str('Email address the customer gave, used to verify they own the order')
const ORDER = str('Order ID, e.g. NW-5001')

export const TOOLS: ToolDeclaration[] = [
  {
    name: 'find_customer',
    description: 'Look up a customer by email. Returns the account and a summary of their orders.',
    parametersJsonSchema: obj({ email: str('Customer email address') }, ['email']),
  },
  {
    name: 'get_order',
    description: 'Full details of one order: items, totals, refunds so far, status and delivery dates.',
    parametersJsonSchema: obj({ order_id: ORDER, customer_email: EMAIL }, ['order_id', 'customer_email']),
  },
  {
    name: 'track_shipment',
    description: 'Carrier tracking for a shipped order, including the last scan and days without movement.',
    parametersJsonSchema: obj({ order_id: ORDER, customer_email: EMAIL }, ['order_id', 'customer_email']),
  },
  {
    name: 'search_policy',
    description: 'Search store policy (refunds, damaged items, approvals, shipping, address changes, lost parcels).',
    parametersJsonSchema: obj({ query: str('What you need to know, in a few words') }, ['query']),
  },
  {
    name: 'issue_refund',
    description: `Refund money on a delivered order. Refunds above $${APPROVAL_LIMIT} pause for a human supervisor to approve.`,
    parametersJsonSchema: obj(
      { order_id: ORDER, customer_email: EMAIL, amount: { type: 'number', description: 'Amount in USD' }, reason: str('Short reason, shown to the supervisor') },
      ['order_id', 'customer_email', 'amount', 'reason'],
    ),
  },
  {
    name: 'update_shipping_address',
    description: 'Change the shipping address of an order that has not shipped yet.',
    parametersJsonSchema: obj({ order_id: ORDER, customer_email: EMAIL, address: str('Full new address') }, ['order_id', 'customer_email', 'address']),
  },
  {
    name: 'escalate_to_human',
    description: 'Hand the case to a human agent, e.g. carrier investigations or requests outside policy.',
    parametersJsonSchema: obj(
      { summary: str('What happened and what the customer needs'), priority: { type: 'string', enum: ['low', 'normal', 'high'] }, order_id: ORDER },
      ['summary', 'priority'],
    ),
  },
]

export type ToolResult = Record<string, unknown>

export interface ToolOutcome {
  result: ToolResult
  store: Store
  /** Set when the call needs a human decision before it can run. */
  needsApproval?: string
}

type Args = Record<string, unknown>

const text = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '')

function ownedOrder(store: Store, a: Args): Order | { error: string } {
  const id = text(a, 'order_id').toUpperCase()
  const email = text(a, 'customer_email').toLowerCase()
  const order = store.orders.find((o) => o.id === id)
  const customer = store.customers.find((c) => c.email === email)
  // Same message whether the order is missing or belongs to someone else: no account probing.
  if (!order || !customer || order.customerId !== customer.id) return { error: `No order ${id || '(missing id)'} found for ${email || '(missing email)'}.` }
  return order
}

function orderView(store: Store, o: Order) {
  return {
    order_id: o.id,
    placed: o.placedAt,
    status: o.status,
    items: o.items.map((i) => `${i.qty} × ${i.name} @ $${i.price}`),
    shipping_fee: o.shipping,
    total: orderTotal(o),
    refunded_so_far: refunded(o),
    refundable_remaining: round2(orderTotal(o) - refunded(o)),
    address: o.address,
    delivered: o.deliveredAt ?? null,
    days_since_delivery: o.deliveredAt ? daysBetween(o.deliveredAt, store.today) : null,
    refunds: o.refunds,
  }
}

function updateOrder(store: Store, id: string, patch: (o: Order) => Order): Store {
  return { ...store, orders: store.orders.map((o) => (o.id === id ? patch(o) : o)) }
}

export function runTool(name: string, args: Args, store: Store, approved = false): ToolOutcome {
  const done = (result: ToolResult, next = store): ToolOutcome => ({ result, store: next })

  switch (name) {
    case 'find_customer': {
      const email = text(args, 'email').toLowerCase()
      const customer = store.customers.find((c) => c.email === email)
      if (!customer) return done({ error: `No customer with email ${email}.` })
      const orders = store.orders.filter((o) => o.customerId === customer.id)
      return done({
        customer: { name: customer.name, email: customer.email, member: customer.tier === 'member', customer_since: customer.since },
        orders: orders.map((o) => ({ order_id: o.id, placed: o.placedAt, status: o.status, total: orderTotal(o) })),
      })
    }

    case 'get_order': {
      const o = ownedOrder(store, args)
      return done('error' in o ? o : orderView(store, o))
    }

    case 'track_shipment': {
      const o = ownedOrder(store, args)
      if ('error' in o) return done(o)
      if (o.status === 'processing') return done({ order_id: o.id, status: 'processing', note: 'Not shipped yet.' })
      const stuck = o.lastScan?.match(/since (\d{4}-\d{2}-\d{2})/)
      return done({
        order_id: o.id,
        status: o.status,
        carrier: o.carrier,
        tracking: o.tracking,
        shipped: o.shippedAt,
        delivered: o.deliveredAt ?? null,
        last_scan: o.deliveredAt ? `Delivered ${o.deliveredAt}` : o.lastScan,
        days_without_movement: stuck ? daysBetween(stuck[1], store.today) : 0,
      })
    }

    case 'search_policy': {
      const words = text(args, 'query').toLowerCase().split(/\W+/).filter((w) => w.length > 2)
      const scored = POLICY.map((p) => {
        const hay = `${p.title} ${p.text}`.toLowerCase()
        return { p, score: words.filter((w) => hay.includes(w.replace(/s$/, ''))).length }
      })
      const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)
      return done({ results: (hits.length ? hits.map((h) => h.p) : POLICY.slice(0, 3)).map((p) => ({ id: p.id, title: p.title, text: p.text })) })
    }

    case 'issue_refund': {
      const o = ownedOrder(store, args)
      if ('error' in o) return done(o)
      const amount = round2(Number(args.amount))
      const reason = text(args, 'reason') || 'Not given'
      if (!(amount > 0)) return done({ error: 'Refund amount must be a positive number.' })
      if (o.status !== 'delivered' || !o.deliveredAt) return done({ error: `Order ${o.id} is ${o.status}; only delivered orders can be refunded.` })
      const age = daysBetween(o.deliveredAt, store.today)
      if (age > 30) return done({ error: `Order ${o.id} was delivered ${age} days ago, outside the 30-day refund window.` })
      const remaining = round2(orderTotal(o) - refunded(o))
      if (amount > remaining) return done({ error: `Only $${remaining} of order ${o.id} is still refundable.` })
      if (amount > APPROVAL_LIMIT && !approved) {
        return { result: { status: 'pending_approval' }, store, needsApproval: `Refund $${amount} on ${o.id}: ${reason}` }
      }
      const refund = { amount, reason, at: store.today, approvedBy: approved ? ('human' as const) : ('policy' as const) }
      return done(
        { status: 'refunded', order_id: o.id, amount, approved_by: refund.approvedBy, refunded_so_far: round2(refunded(o) + amount), arrives: 'Back on the original payment method in 3–5 business days' },
        updateOrder(store, o.id, (x) => ({ ...x, refunds: [...x.refunds, refund] })),
      )
    }

    case 'update_shipping_address': {
      const o = ownedOrder(store, args)
      if ('error' in o) return done(o)
      const address = text(args, 'address')
      if (address.length < 8) return done({ error: 'Need the full new address.' })
      if (o.status !== 'processing') return done({ error: `Order ${o.id} has already ${o.status === 'shipped' ? 'shipped' : 'been ' + o.status}; the address can no longer be changed.` })
      return done({ status: 'updated', order_id: o.id, address }, updateOrder(store, o.id, (x) => ({ ...x, address })))
    }

    case 'escalate_to_human': {
      const summary = text(args, 'summary')
      if (summary.length < 10) return done({ error: 'Add a summary a human can act on.' })
      const priority = (['low', 'normal', 'high'] as const).find((p) => p === args.priority) ?? 'normal'
      const id = `ESC-${String(store.escalations.length + 1).padStart(3, '0')}`
      const orderId = text(args, 'order_id').toUpperCase() || undefined
      return done(
        { status: 'escalated', ticket: id, priority, expected_response: priority === 'high' ? 'within 4 hours' : 'within 1 business day' },
        { ...store, escalations: [...store.escalations, { id, summary: summary.slice(0, 500), priority, orderId, at: store.today }] },
      )
    }

    default:
      return done({ error: `Unknown tool ${name}.` })
  }
}
