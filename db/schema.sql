-- Tables for the payment reporting demo.
-- There are deliberately NO indexes on the transaction filter columns
-- (merchant_id, created_at, status). db/add-indexes.sql adds them during
-- `npm run perf` so the demo can show query speed before and after.

CREATE TABLE merchants (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE transactions (
  id             INTEGER PRIMARY KEY,
  merchant_id    INTEGER NOT NULL REFERENCES merchants (id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT    NOT NULL DEFAULT 'USD',
  status         TEXT    NOT NULL CHECK (status IN ('approved', 'declined', 'refunded')),
  decline_reason TEXT,
  card_brand     TEXT    NOT NULL,
  card_last4     TEXT    NOT NULL CHECK (length(card_last4) = 4),
  created_at     TEXT    NOT NULL, -- ISO 8601 in UTC, e.g. '2026-03-14T09:30:00.000Z'

  -- A decline reason is required for declined rows and forbidden otherwise
  CHECK (
    (status = 'declined' AND decline_reason IS NOT NULL)
    OR (status <> 'declined' AND decline_reason IS NULL)
  )
);
