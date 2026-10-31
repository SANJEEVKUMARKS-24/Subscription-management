-- Optional, repeat-safe fictional data for a local presentation database.
-- __DEMO_CUSTOMER_ID__ is replaced by seedDemoPresentation.js after locating the owner.

INSERT INTO customers (company_name, email, billing_email, phone, billing_address, tax_identifier)
VALUES
  ('Demo Northstar Analytics', 'northstar@demo.example', 'billing.northstar@demo.example', '+1-202-555-0101', '100 Example Way, Sample City, CA 90001', 'DEMO-001'),
  ('Demo Cedar & Finch Studio', 'cedarfinch@demo.example', 'billing.cedarfinch@demo.example', '+1-202-555-0102', '200 Fictional Avenue, Sample City, NY 10001', 'DEMO-002'),
  ('Demo Blue Peak Fitness', 'bluepeak@demo.example', 'billing.bluepeak@demo.example', '+1-202-555-0103', '300 Placeholder Road, Sample City, TX 73301', 'DEMO-003'),
  ('Demo Copperline Foods', 'copperline@demo.example', 'billing.copperline@demo.example', '+1-202-555-0104', '400 Mockingbird Lane, Sample City, WA 98001', 'DEMO-004'),
  ('Demo Harborlight Learning', 'harborlight@demo.example', 'billing.harborlight@demo.example', '+1-202-555-0105', '500 Example Street, Sample City, IL 60007', 'DEMO-005'),
  ('Demo Juniper Home Care', 'juniperhome@demo.example', 'billing.juniperhome@demo.example', '+1-202-555-0106', '600 Demo Boulevard, Sample City, FL 33101', 'DEMO-006'),
  ('Demo Meridian Design Lab', 'meridianlab@demo.example', 'billing.meridianlab@demo.example', '+1-202-555-0107', '700 Test Drive, Sample City, CO 80014', 'DEMO-007'),
  ('Demo Orchard Cloud Systems', 'orchardcloud@demo.example', 'billing.orchardcloud@demo.example', '+1-202-555-0108', '800 Sandbox Circle, Sample City, MA 01002', 'DEMO-008'),
  ('Demo Silver Fern Logistics', 'silverfern@demo.example', 'billing.silverfern@demo.example', '+1-202-555-0109', '900 Trial Court, Sample City, OR 97035', 'DEMO-009'),
  ('Demo Willow Works', 'willowworks@demo.example', 'billing.willowworks@demo.example', '+1-202-555-0110', '1000 Sample Plaza, Sample City, AZ 85001', 'DEMO-010')
ON CONFLICT (email) DO NOTHING;

INSERT INTO plans (plan_name, description, price, billing_frequency, allow_pause, allow_renewal, allow_early_closure)
SELECT v.plan_name, v.description, v.price, v.billing_frequency::billing_frequency, TRUE, TRUE, TRUE
FROM (VALUES
  ('Demo Essential Monthly', 'Video demo plan: essential monthly service', 19.00::numeric, 'MONTHLY'),
  ('Demo Growth Monthly', 'Video demo plan: growth monthly service', 49.00::numeric, 'MONTHLY'),
  ('Demo Annual', 'Video demo plan: annual service', 399.00::numeric, 'YEARLY')
) AS v(plan_name, description, price, billing_frequency)
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.plan_name=v.plan_name);

INSERT INTO subscriptions (customer_id, plan_id, subscription_number, start_date, next_billing_at, status, payment_terms_days)
SELECT __DEMO_CUSTOMER_ID__, p.plan_id, v.subscription_number, v.start_date::date,
       v.next_billing_at::timestamptz, v.status::subscription_status, 0
FROM (VALUES
  ('DEMO-MF-001', 'Demo Essential Monthly', '2026-09-01', '2026-11-01 00:00:00+00', 'ACTIVE'),
  ('DEMO-MF-002', 'Demo Growth Monthly', '2026-10-01', '2026-11-01 00:00:00+00', 'CONFIRMED'),
  ('DEMO-MF-003', 'Demo Annual', '2026-06-01', '2027-06-01 00:00:00+00', 'PAUSED'),
  ('DEMO-MF-004', 'Demo Essential Monthly', '2026-08-01', '2026-11-01 00:00:00+00', 'ACTIVE'),
  ('DEMO-MF-005', 'Demo Growth Monthly', '2026-07-15', '2026-11-01 00:00:00+00', 'ACTIVE'),
  ('DEMO-MF-006', 'Demo Annual', '2026-03-01', '2027-03-01 00:00:00+00', 'ACTIVE'),
  ('DEMO-MF-007', 'Demo Essential Monthly', '2026-01-15', NULL, 'CLOSED'),
  ('DEMO-MF-008', 'Demo Growth Monthly', '2026-10-31', NULL, 'DRAFT')
) AS v(subscription_number, plan_name, start_date, next_billing_at, status)
JOIN plans p ON p.plan_name=v.plan_name AND p.is_active=TRUE
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.subscription_number=v.subscription_number)
ON CONFLICT (subscription_number) DO NOTHING;

INSERT INTO subscription_items (subscription_id, description_snapshot, quantity, unit_price, tax_rate_snapshot)
SELECT s.subscription_id, p.plan_name, 1, p.price, 0
FROM subscriptions s JOIN plans p ON p.plan_id=s.plan_id
WHERE s.subscription_number LIKE 'DEMO-MF-%'
AND NOT EXISTS (SELECT 1 FROM subscription_items si WHERE si.subscription_id=s.subscription_id);

INSERT INTO invoices (customer_id, subscription_id, invoice_number, invoice_date, due_date, billing_period_start, billing_period_end, subtotal, discount_amount, tax_amount, total_amount, status, currency)
SELECT __DEMO_CUSTOMER_ID__, s.subscription_id, v.invoice_number, v.invoice_date::date, v.due_date::date,
       v.period_start::date, v.period_end::date, v.amount::numeric, 0, 0, v.amount::numeric,
       v.status::invoice_status, 'USD'
FROM (VALUES
  ('DEMO-INV-MF-001', 'DEMO-MF-001', '2026-09-01', '2026-09-15', '2026-09-01', '2026-09-30', 19.00, 'PAID'),
  ('DEMO-INV-MF-002', 'DEMO-MF-004', '2026-10-01', '2026-10-15', '2026-10-01', '2026-10-31', 19.00, 'OVERDUE'),
  ('DEMO-INV-MF-003', 'DEMO-MF-002', '2026-09-01', '2026-09-15', '2026-09-01', '2026-09-30', 49.00, 'PAID'),
  ('DEMO-INV-MF-004', 'DEMO-MF-005', '2026-10-01', '2026-10-15', '2026-10-01', '2026-10-31', 49.00, 'PARTIALLY_PAID'),
  ('DEMO-INV-MF-005', 'DEMO-MF-006', '2026-03-01', '2026-03-15', '2026-03-01', '2027-02-28', 399.00, 'PAID'),
  ('DEMO-INV-MF-006', 'DEMO-MF-003', '2026-06-01', '2026-06-15', '2026-06-01', '2027-05-31', 399.00, 'PAID')
) AS v(invoice_number, subscription_number, invoice_date, due_date, period_start, period_end, amount, status)
JOIN subscriptions s ON s.subscription_number=v.subscription_number
WHERE s.customer_id=__DEMO_CUSTOMER_ID__
AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.invoice_number=v.invoice_number)
ON CONFLICT (invoice_number) DO NOTHING;

INSERT INTO invoice_items (invoice_id, description_snapshot, quantity, unit_price, discount_amount, tax_rate_snapshot, tax_amount, line_total)
SELECT i.invoice_id, p.plan_name, 1, i.subtotal, 0, 0, 0, i.subtotal
FROM invoices i JOIN subscriptions s ON s.subscription_id=i.subscription_id JOIN plans p ON p.plan_id=s.plan_id
WHERE i.invoice_number LIKE 'DEMO-INV-MF-%'
AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.invoice_id=i.invoice_id);

INSERT INTO payments (invoice_id, payment_reference, payment_method, amount, currency, payment_date, paid_at, status, note, provider)
SELECT i.invoice_id, v.payment_reference, 'demo_card', v.amount::numeric, 'USD', v.paid_at::timestamptz,
       v.paid_at::timestamptz, 'SUCCESS', 'Fictional video demo payment; no money was charged', 'demo'
FROM (VALUES
  ('DEMO-PAY-MF-001', 'DEMO-INV-MF-001', 19.00, '2026-09-10 12:00:00+00'),
  ('DEMO-PAY-MF-003', 'DEMO-INV-MF-003', 49.00, '2026-10-20 12:00:00+00'),
  ('DEMO-PAY-MF-004', 'DEMO-INV-MF-004', 20.00, '2026-10-12 12:00:00+00'),
  ('DEMO-PAY-MF-005', 'DEMO-INV-MF-005', 399.00, '2026-03-05 12:00:00+00'),
  ('DEMO-PAY-MF-006', 'DEMO-INV-MF-006', 399.00, '2026-06-05 12:00:00+00')
) AS v(payment_reference, invoice_number, amount, paid_at)
JOIN invoices i ON i.invoice_number=v.invoice_number
WHERE i.customer_id=__DEMO_CUSTOMER_ID__
AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.payment_reference=v.payment_reference);
