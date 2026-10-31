ALTER TYPE quotation_status ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);
UPDATE customers SET billing_email = email WHERE billing_email IS NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_terms_days_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_payment_terms_days_check CHECK (payment_terms_days >= 0);
ALTER TABLE subscription_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_product_variant_unique;
ALTER TABLE product_variants ADD CONSTRAINT product_variants_product_variant_unique UNIQUE (product_id, variant_id);
ALTER TABLE plan_items DROP CONSTRAINT IF EXISTS plan_items_variant_id_fkey;
ALTER TABLE plan_items DROP CONSTRAINT IF EXISTS plan_items_variant_product_fkey;
ALTER TABLE plan_items ADD CONSTRAINT plan_items_variant_product_fkey
  FOREIGN KEY (product_id, variant_id) REFERENCES product_variants(product_id, variant_id) ON DELETE RESTRICT;
ALTER TABLE subscription_items DROP CONSTRAINT IF EXISTS subscription_items_variant_id_fkey;
ALTER TABLE subscription_items DROP CONSTRAINT IF EXISTS subscription_items_variant_product_fkey;
ALTER TABLE subscription_items DROP CONSTRAINT IF EXISTS subscription_items_variant_product_check;
ALTER TABLE subscription_items ADD CONSTRAINT subscription_items_variant_product_fkey
  FOREIGN KEY (product_id, variant_id) REFERENCES product_variants(product_id, variant_id) ON DELETE RESTRICT;
ALTER TABLE subscription_items ADD CONSTRAINT subscription_items_variant_product_check
  CHECK (variant_id IS NULL OR product_id IS NOT NULL);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS provider_refund_id TEXT;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'products';
ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_applies_to_check;
ALTER TABLE discounts ADD CONSTRAINT discounts_applies_to_check
  CHECK (applies_to IN ('products', 'subscription'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS customer_role_scope;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD CONSTRAINT customer_role_scope CHECK (
  (role = 'CUSTOMER' AND customer_id IS NOT NULL)
  OR (role IN ('ADMIN', 'STAFF') AND customer_id IS NULL)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  resource_id BIGINT,
  status TEXT NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (scope, key)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  webhook_event_id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_unique
  ON payments(provider, provider_payment_id)
  WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_unique
  ON payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_provider_id_unique
  ON payment_refunds(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
  ON idempotency_keys(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events(status, received_at);
