CREATE OR REPLACE FUNCTION fn_invoice_outstanding(p_invoice_id BIGINT)
RETURNS NUMERIC(12,2)
LANGUAGE SQL
STABLE AS $$
    SELECT
        i.total_amount
        - COALESCE(SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN pr.status = 'COMPLETED' THEN pr.amount ELSE 0 END), 0)
    FROM invoices i
    LEFT JOIN payments p ON p.invoice_id = i.invoice_id
    LEFT JOIN payment_refunds pr ON pr.payment_id = p.payment_id
    WHERE i.invoice_id = p_invoice_id
    GROUP BY i.total_amount;
$$;

CREATE OR REPLACE FUNCTION fn_discount_can_apply(p_discount_id BIGINT, p_product_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM discounts d
        LEFT JOIN discount_products dp ON dp.discount_id = d.discount_id
        WHERE d.discount_id = p_discount_id
          AND d.is_active = TRUE
          AND d.starts_at <= NOW()
          AND (d.ends_at IS NULL OR d.ends_at >= NOW())
          AND (
              dp.product_id IS NULL
              OR dp.product_id = p_product_id
          )
    );
$$;

CREATE OR REPLACE FUNCTION fn_subscription_status_count(p_customer_id BIGINT, p_status subscription_status)
RETURNS INTEGER
LANGUAGE SQL
STABLE AS $$
    SELECT COUNT(*)::INTEGER
    FROM subscriptions
    WHERE customer_id = p_customer_id
      AND status = p_status;
$$;

CREATE OR REPLACE VIEW v_customer_subscriptions AS
SELECT
    s.subscription_id,
    s.customer_id,
    c.company_name,
    p.plan_name,
    s.subscription_number,
    s.status,
    s.start_date,
    s.expiry_date,
    s.next_billing_at,
    s.payment_terms
FROM subscriptions s
JOIN customers c ON c.customer_id = s.customer_id
JOIN plans p ON p.plan_id = s.plan_id;

CREATE OR REPLACE VIEW v_invoice_balance AS
SELECT
    i.invoice_id,
    i.invoice_number,
    i.customer_id,
    c.company_name,
    i.total_amount,
    COALESCE(SUM(CASE WHEN pay.status = 'SUCCESS' THEN pay.amount ELSE 0 END), 0) AS paid_amount,
    COALESCE(SUM(CASE WHEN pay.status = 'PENDING' THEN pay.amount ELSE 0 END), 0) AS pending_amount,
    COALESCE(SUM(CASE WHEN ref.status = 'COMPLETED' THEN ref.amount ELSE 0 END), 0) AS refunded_amount,
    fn_invoice_outstanding(i.invoice_id) AS outstanding_amount
FROM invoices i
JOIN customers c ON c.customer_id = i.customer_id
LEFT JOIN payments pay ON pay.invoice_id = i.invoice_id
LEFT JOIN payment_refunds ref ON ref.payment_id = pay.payment_id
GROUP BY i.invoice_id, i.invoice_number, i.customer_id, c.company_name, i.total_amount;

CREATE OR REPLACE VIEW v_overdue_invoices AS
SELECT
    i.invoice_id,
    i.invoice_number,
    i.customer_id,
    c.company_name,
    i.due_date,
    i.status,
    fn_invoice_outstanding(i.invoice_id) AS outstanding_amount
FROM invoices i
JOIN customers c ON c.customer_id = i.customer_id
WHERE i.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
  AND fn_invoice_outstanding(i.invoice_id) > 0
  AND i.due_date < CURRENT_DATE;

CREATE OR REPLACE VIEW v_discount_usage_status AS
SELECT
    d.discount_id,
    d.discount_name,
    d.discount_type,
    d.discount_value,
    d.usage_limit,
    d.usage_count,
    CASE
        WHEN d.usage_limit IS NULL THEN NULL
        ELSE d.usage_limit - d.usage_count
    END AS remaining_usage,
    d.is_active,
    d.starts_at,
    d.ends_at
FROM discounts d;