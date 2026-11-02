// Northwind Outfitters, the fictional outdoor-gear store the agent works for. The whole store is
// one plain object: the browser keeps it, sends it with each turn and gets back the updated copy,
// so the demo needs no database and every visitor gets their own sandbox.

export type OrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled'

export interface Item {
  sku: string
  name: string
  qty: number
  price: number
}

export interface Refund {
  amount: number
  reason: string
  at: string
  approvedBy: 'policy' | 'human'
}

export interface Order {
  id: string
  customerId: string
  placedAt: string
  status: OrderStatus
  items: Item[]
  shipping: number
  address: string
  carrier?: string
  tracking?: string
  shippedAt?: string
  deliveredAt?: string
  /** Last carrier scan, for orders in transit. */
  lastScan?: string
  refunds: Refund[]
}

export interface Customer {
  id: string
  name: string
  email: string
  since: string
  tier: 'standard' | 'member'
}

export interface Escalation {
  id: string
  summary: string
  priority: 'low' | 'normal' | 'high'
  orderId?: string
  at: string
}

export interface Store {
  /** The store's "today" (YYYY-MM-DD); fixed per sandbox so policy windows are deterministic. */
  today: string
  customers: Customer[]
  orders: Order[]
  escalations: Escalation[]
}

const DAY = 86_400_000

export function isoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY)
}

export function orderTotal(o: Order) {
  return round2(o.items.reduce((s, i) => s + i.price * i.qty, 0) + o.shipping)
}

export function refunded(o: Order) {
  return round2(o.refunds.reduce((s, r) => s + r.amount, 0))
}

export function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** A fresh store whose dates are relative to `now`, so the demo never goes stale. */
export function seedStore(now = Date.now()): Store {
  const d = (daysAgo: number) => isoDay(now - daysAgo * DAY)
  const c = (id: string, name: string, email: string, since: number, tier: Customer['tier']): Customer => ({ id, name, email, since: d(since), tier })
  return {
    today: d(0),
    customers: [
      c('C-101', 'Maya Patel', 'maya.patel@example.com', 900, 'member'),
      c('C-102', 'Jonas Becker', 'jonas.becker@example.com', 400, 'standard'),
      c('C-103', 'Aisha Bello', 'aisha.bello@example.com', 60, 'standard'),
      c('C-104', 'Leo Martins', 'leo.martins@example.com', 1200, 'member'),
      c('C-105', 'Grace Kim', 'grace.kim@example.com', 20, 'standard'),
    ],
    orders: [
      {
        id: 'NW-5001', customerId: 'C-101', placedAt: d(9), status: 'shipped', shipping: 0,
        items: [{ sku: 'TNT-2P', name: 'Ridgeline 2-Person Tent', qty: 1, price: 289 }],
        address: '14 Elm Street, Portland, OR 97205', carrier: 'UPS', tracking: '1Z84F2A10398', shippedAt: d(7),
        lastScan: `Stuck at Reno, NV hub since ${d(5)}, no movement`, refunds: [],
      },
      {
        id: 'NW-5002', customerId: 'C-101', placedAt: d(20), status: 'delivered', shipping: 6.95,
        items: [{ sku: 'MUG-ENM', name: 'Enamel Camp Mug', qty: 2, price: 18 }, { sku: 'HDL-300', name: 'Trail Headlamp 300lm', qty: 1, price: 46 }],
        address: '14 Elm Street, Portland, OR 97205', carrier: 'USPS', tracking: '9400 1112 0298', shippedAt: d(18), deliveredAt: d(15), refunds: [],
      },
      {
        id: 'NW-5003', customerId: 'C-102', placedAt: d(12), status: 'delivered', shipping: 0,
        items: [{ sku: 'JKT-RAIN', name: 'Stormline Rain Jacket', qty: 1, price: 164 }],
        address: 'Bergstraße 8, 10115 Berlin, Germany', carrier: 'DHL', tracking: 'JD01460000123', shippedAt: d(10), deliveredAt: d(6), refunds: [],
      },
      {
        id: 'NW-5004', customerId: 'C-102', placedAt: d(55), status: 'delivered', shipping: 0,
        items: [{ sku: 'BAG-35L', name: 'Summit 35L Daypack', qty: 1, price: 129 }],
        address: 'Bergstraße 8, 10115 Berlin, Germany', carrier: 'DHL', tracking: 'JD01460000077', shippedAt: d(53), deliveredAt: d(48), refunds: [],
      },
      {
        id: 'NW-5005', customerId: 'C-103', placedAt: d(1), status: 'processing', shipping: 6.95,
        items: [{ sku: 'BTL-1L', name: 'Insulated Bottle 1L', qty: 2, price: 34 }],
        address: '220 King Street W, Toronto, ON M5H 1K4', refunds: [],
      },
      {
        id: 'NW-5006', customerId: 'C-104', placedAt: d(30), status: 'delivered', shipping: 0,
        items: [{ sku: 'STV-CMP', name: 'Compact Camp Stove', qty: 1, price: 64 }, { sku: 'GAS-230', name: 'Fuel Canister 230g', qty: 3, price: 8 }],
        address: '9 Rua Augusta, 1100-053 Lisbon, Portugal', carrier: 'CTT', tracking: 'RR123456785PT', shippedAt: d(28), deliveredAt: d(24),
        refunds: [{ amount: 24, reason: 'Fuel canisters arrived punctured', at: d(22), approvedBy: 'policy' }],
      },
      {
        id: 'NW-5007', customerId: 'C-105', placedAt: d(3), status: 'shipped', shipping: 0,
        items: [{ sku: 'SLP-BAG', name: 'Alpine Down Sleeping Bag', qty: 1, price: 349 }],
        address: '77 Harbor Road, Seattle, WA 98101', carrier: 'FedEx', tracking: '7712 3456 9012', shippedAt: d(2),
        lastScan: 'Out for delivery today', refunds: [],
      },
    ],
    escalations: [],
  }
}

export const POLICY = [
  { id: 'returns-window', title: 'Return and refund window', text: 'Items can be returned for a full refund within 30 days of delivery. After 30 days we cannot refund, but members can request store credit within 60 days.' },
  { id: 'damaged', title: 'Damaged or defective items', text: 'If an item arrives damaged or defective, refund it in full (item price only) within 30 days of delivery. No return is needed for items under $75; above that, the customer must return the item.' },
  { id: 'approval', title: 'Refund approval limits', text: 'Agents may issue refunds up to $100 per order on their own. Any refund above $100 must be approved by a human supervisor before it is issued.' },
  { id: 'shipping-refund', title: 'Shipping fees', text: 'Shipping fees are refunded only when the whole order is refunded because of our mistake (wrong, damaged or lost items).' },
  { id: 'lost', title: 'Lost or stuck shipments', text: 'If a shipment has had no carrier scan for 5 or more days, open a carrier investigation by escalating to a human with high priority. Do not refund or reship until the investigation is opened.' },
  { id: 'address', title: 'Changing the shipping address', text: 'The address can be changed only while the order is still processing. Once shipped, we cannot redirect it; the customer can contact the carrier.' },
  { id: 'identity', title: 'Verifying the customer', text: 'Only discuss or change an order after matching the customer by the email address on the account. Never reveal another customer’s details.' },
  { id: 'scope', title: 'What the agent cannot do', text: 'The agent cannot give discounts or coupons, change prices, or promise delivery dates. Requests outside policy go to a human.' },
]
