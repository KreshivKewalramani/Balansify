CREATE TABLE IF NOT EXISTS financial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  company_name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  current_assets NUMERIC NOT NULL,
  current_liabilities NUMERIC NOT NULL,
  inventory NUMERIC NOT NULL,
  cash_and_equivalents NUMERIC NOT NULL,
  cost_of_goods_sold NUMERIC NOT NULL,
  revenue NUMERIC NOT NULL,
  net_profit NUMERIC NOT NULL,
  total_assets NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to ensure script is idempotent)
DROP POLICY IF EXISTS select_financial_records ON financial_records;
DROP POLICY IF EXISTS insert_financial_records ON financial_records;
DROP POLICY IF EXISTS update_financial_records ON financial_records;
DROP POLICY IF EXISTS delete_financial_records ON financial_records;

-- Select: Anyone can read public (null user_id) or their own records
CREATE POLICY select_financial_records ON financial_records
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

-- Insert/Update/Delete: Authenticated users can modify their own records
CREATE POLICY insert_financial_records ON financial_records
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY update_financial_records ON financial_records
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY delete_financial_records ON financial_records
  FOR DELETE USING (user_id = auth.uid());

-- Rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  last_request TIMESTAMP WITH TIME ZONE DEFAULT now(),
  request_count INTEGER DEFAULT 1
);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Rate limit policy: Authenticated users can only see and modify their own rate limit keys
DROP POLICY IF EXISTS rate_limits_policy ON rate_limits;
CREATE POLICY rate_limits_policy ON rate_limits
  FOR ALL TO authenticated
  USING (key LIKE auth.uid()::text || '%')
  WITH CHECK (key LIKE auth.uid()::text || '%');

-- Seed initial corporate sample data
INSERT INTO financial_records (
  company_name,
  fiscal_year,
  current_assets,
  current_liabilities,
  inventory,
  cash_and_equivalents,
  cost_of_goods_sold,
  revenue,
  net_profit,
  total_assets
) VALUES (
  'Acme Global Corp',
  2025,
  1200000,   -- Current Assets
  600000,    -- Current Liabilities
  300000,    -- Inventory
  400000,    -- Cash & Equivalents
  1800000,   -- Cost of Goods Sold
  3000000,   -- Revenue
  450000,    -- Net Profit
  2500000    -- Total Assets
) ON CONFLICT DO NOTHING;
