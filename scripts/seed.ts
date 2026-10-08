// Generates a reproducible fake dataset: ~50 merchants and 500,000
// transactions over the past 12 months. Run with: npm run seed
import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'

const DB_PATH = 'db/data/payments.db'
const TRANSACTION_COUNT = 500_000
const SEED = 42

// mulberry32: a tiny seeded random number generator. Math.random() can't be
// seeded, so using our own means the same SEED always gives the same data.
function mulberry32(seed: number) {
  let state = seed
  return function random(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = mulberry32(SEED)

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

// Picks a value using relative weights, e.g. [['Visa', 50], ['Amex', 10]]
function pickWeighted<T>(options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of options) {
    roll -= weight
    if (roll < 0) return value
  }
  return options[options.length - 1][0]
}

// Fictional merchants by category. Each category has a typical price range
// in dollars so transaction amounts look realistic.
const MERCHANT_CATEGORIES = [
  {
    category: 'Hotel',
    minDollars: 89,
    maxDollars: 900,
    names: [
      'Harborview Grand Hotel',
      'Pinecrest Lodge & Suites',
      'Copper Canyon Inn',
      'Lakeside Meridian Hotel',
      'The Silver Fern Hotel',
      'Bluebird Bay Hotel',
      'Granite Peak Inn',
      'Driftwood Coast Hotel',
      'Willow Creek Suites',
      'Amber Valley Hotel',
    ],
  },
  {
    category: 'University',
    minDollars: 25,
    maxDollars: 5000,
    names: [
      'Northfield State University',
      'Ridgemont College',
      'Eastbrook University',
      'Clearwater Technical Institute',
      'Highland Valley University',
      'Westmoor College of Arts',
      'Stonebridge University',
      'Lakemont Community College',
      'Fairhaven Institute of Technology',
      'Cedar Ridge University',
    ],
  },
  {
    category: 'Casino',
    minDollars: 20,
    maxDollars: 2000,
    names: [
      'Copper Coin Casino',
      'Golden Mesa Casino',
      'Riverbend Royale Casino',
      'Silver Sage Casino',
      'Starfall Gaming Hall',
      'High Desert Card Club',
      'Emerald Spur Casino',
      'Lucky Lantern Casino',
      'Diamond Gulch Casino',
      'Thunder Basin Casino',
    ],
  },
  {
    category: 'Ski Resort',
    minDollars: 30,
    maxDollars: 1200,
    names: [
      'Frostline Peaks Ski Resort',
      'Summit Hollow Ski Area',
      'Snowcap Basin Resort',
      'Glacier Notch Ski Resort',
      'Whitepine Mountain Resort',
      'Silver Drift Ski Area',
      'Eagle Pass Ski Resort',
      'Avalanche Bowl Resort',
      'Blizzard Butte Ski Area',
      'Icefall Canyon Resort',
    ],
  },
  {
    category: 'Restaurant',
    minDollars: 12,
    maxDollars: 250,
    names: [
      'The Rusty Spoon',
      'Saffron & Sage',
      'Blue Plate Diner',
      'Ember Grill House',
      'Little Fig Bistro',
      'Harbor Light Oyster Bar',
      'Maple Street Kitchen',
      'Golden Noodle House',
      'Prairie Fire Steakhouse',
      'Olive Branch Trattoria',
    ],
  },
]

const CARD_BRANDS = [
  ['Visa', 50],
  ['Mastercard', 30],
  ['Amex', 12],
  ['Discover', 8],
] as const

// About 88% approved, 9% declined, 3% refunded
const STATUSES = [
  ['approved', 88],
  ['declined', 9],
  ['refunded', 3],
] as const

const DECLINE_REASONS = [
  ['Insufficient funds', 35],
  ['Do not honor', 25],
  ['Expired card', 12],
  ['Incorrect CVC', 10],
  ['Suspected fraud', 8],
  ['Invalid card number', 6],
  ['Processing error', 4],
] as const

type Merchant = {
  id: number
  name: string
  category: string
  minCents: number
  maxCents: number
}

// Flatten the categories into one list with ids 1 to 50
const merchants: Merchant[] = []
for (const group of MERCHANT_CATEGORIES) {
  for (const name of group.names) {
    merchants.push({
      id: merchants.length + 1,
      name,
      category: group.category,
      minCents: group.minDollars * 100,
      maxCents: group.maxDollars * 100,
    })
  }
}

// Give each merchant a random weight so some process far more than others
const merchantWeights = merchants.map((m) => [m, randomInt(1, 10)] as const)

// Squaring the random number skews amounts toward the low end of the range,
// like real purchases: lots of small ones, a few large ones.
function randomAmountCents(merchant: Merchant): number {
  const skewed = random() ** 2
  return Math.round(
    merchant.minCents + skewed * (merchant.maxCents - merchant.minCents),
  )
}

// Timestamps cover the 365 days before today (midnight UTC). Anchoring to the
// day keeps the data reproducible while still ending at the present.
const DAY_MS = 24 * 60 * 60 * 1000
const endMs = new Date().setUTCHours(0, 0, 0, 0)
const startMs = endMs - 365 * DAY_MS

// Generate all the times first and sort them, so ids increase with time the
// way they would in a real system. (Typed arrays sort numerically.)
const timestamps = new Float64Array(TRANSACTION_COUNT)
for (let i = 0; i < TRANSACTION_COUNT; i++) {
  timestamps[i] = startMs + random() * (endMs - startMs)
}
timestamps.sort()

function makeTransaction(createdAtMs: number) {
  const merchant = pickWeighted(merchantWeights)
  const status = pickWeighted(STATUSES)
  return {
    merchantId: merchant.id,
    amountCents: randomAmountCents(merchant),
    currency: 'USD',
    status,
    declineReason: status === 'declined' ? pickWeighted(DECLINE_REASONS) : null,
    cardBrand: pickWeighted(CARD_BRANDS),
    // Only a fake last four digits. Full card numbers are never generated.
    cardLast4: String(randomInt(0, 9999)).padStart(4, '0'),
    createdAt: new Date(createdAtMs).toISOString(),
  }
}

// Start from a fresh database file so every run gives the same result.
// (Stop `npm run dev` first: Windows won't delete a file that's open.)
mkdirSync('db/data', { recursive: true })
rmSync(DB_PATH, { force: true })

const db = new Database(DB_PATH)
db.exec(readFileSync('db/schema.sql', 'utf8'))

const insertMerchant = db.prepare(
  'INSERT INTO merchants (id, name, category) VALUES (?, ?, ?)',
)
const insertTransaction = db.prepare(`
  INSERT INTO transactions
    (merchant_id, amount_cents, currency, status, decline_reason,
     card_brand, card_last4, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

// One database transaction around every insert: SQLite writes to disk once
// at the end instead of once per row, so this takes seconds, not minutes.
const insertAll = db.transaction(() => {
  for (const m of merchants) {
    insertMerchant.run(m.id, m.name, m.category)
  }
  for (const createdAtMs of timestamps) {
    const t = makeTransaction(createdAtMs)
    insertTransaction.run(
      t.merchantId,
      t.amountCents,
      t.currency,
      t.status,
      t.declineReason,
      t.cardBrand,
      t.cardLast4,
      t.createdAt,
    )
  }
})

const startTime = performance.now()
insertAll()
const seconds = ((performance.now() - startTime) / 1000).toFixed(1)

// Print a quick check that the data looks realistic
const stats = db
  .prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'approved') AS approved,
       SUM(status = 'declined') AS declined,
       SUM(status = 'refunded') AS refunded,
       MIN(created_at) AS firstDate,
       MAX(created_at) AS lastDate
     FROM transactions`,
  )
  .get() as {
  total: number
  approved: number
  declined: number
  refunded: number
  firstDate: string
  lastDate: string
}

const declineReasons = db
  .prepare(
    `SELECT decline_reason AS reason, COUNT(*) AS count
     FROM transactions
     WHERE status = 'declined'
     GROUP BY decline_reason
     ORDER BY count DESC`,
  )
  .all() as { reason: string; count: number }[]

const approvalRate = (stats.approved / (stats.approved + stats.declined)) * 100

console.log(
  `Seeded ${merchants.length} merchants and ${stats.total.toLocaleString()} transactions in ${seconds}s`,
)
console.log(
  `  approved ${stats.approved.toLocaleString()} | declined ${stats.declined.toLocaleString()} | refunded ${stats.refunded.toLocaleString()}`,
)
console.log(`  approval rate: ${approvalRate.toFixed(1)}%`)
console.log(`  dates: ${stats.firstDate} to ${stats.lastDate}`)
console.log('  decline reasons:')
for (const r of declineReasons) {
  console.log(`    ${r.reason.padEnd(20)} ${r.count.toLocaleString()}`)
}

db.close()
