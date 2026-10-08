-- Indexes for the transaction filters. `npm run perf` applies these
-- (the seed doesn't) so the demo can compare before and after.

-- Merchant + date range: the most common report query. The composite index
-- finds one merchant's rows, already sorted by date.
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_created
  ON transactions (merchant_id, created_at);

-- Date-range filters across all merchants, and the newest-first sort
-- on the transactions table.
CREATE INDEX IF NOT EXISTS idx_transactions_created
  ON transactions (created_at);
