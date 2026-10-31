INSERT INTO customers (company_name, email, phone, billing_address, tax_identifier, is_active)
VALUES
    ('ABC Technologies', 'billing@abctechnologies.com', '+1-555-0142', '1200 Market Street, San Francisco, CA', 'TIN-ABCT-2024', TRUE),
    ('Northwind Labs', 'accounts@northwindlabs.io', '+1-555-0199', '88 Harbor Lane, Seattle, WA', 'TIN-NWL-2024', TRUE);

INSERT INTO users (customer_id, full_name, email, password_hash, role, is_active)
VALUES
    (NULL, 'Brightloop Admin', 'admin@brightloop.io', '$2b$12$0WrU8v0zOH9XH4H9M1wBceN2QfS2M1mt3d0hF5uJdL0wL.aGxE/3C', 'ADMIN', TRUE),
    (1, 'Finance Manager', 'finance@abctechnologies.com', '$2b$12$0WrU8v0zOH9XH4H9M1wBceN2QfS2M1mt3d0hF5uJdL0wL.aGxE/3C', 'CUSTOMER', TRUE),
    (1, 'Operations Lead', 'ops@abctechnologies.com', '$2b$12$0WrU8v0zOH9XH4H9M1wBceN2QfS2M1mt3d0hF5uJdL0wL.aGxE/3C', 'CUSTOMER', TRUE),
    (2, 'Northwind CTO', 'cto@northwindlabs.io', '$2b$12$0WrU8v0zOH9XH4H9M1wBceN2QfS2M1mt3d0hF5uJdL0wL.aGxE/3C', 'CUSTOMER', TRUE);

INSERT INTO products (name, product_type, sales_price, cost_price, notes, is_active)
VALUES
    ('CRM Software', 'SAAS', 950.00, 420.00, 'Core customer management and sales workflows', TRUE),
    ('Email Automation', 'SAAS', 240.00, 110.00, 'Automated outbound communication workflows', TRUE),
    ('Analytics Suite', 'SAAS', 300.00, 135.00, 'Reporting, dashboarding and revenue insights', TRUE),
    ('Support Portal', 'SAAS', 180.00, 85.00, 'Shared helpdesk and ticketing portal', TRUE);

INSERT INTO product_variants (product_id, variant_name, additional_price, is_active)
VALUES
    (1, 'Enterprise', 250.00, TRUE),
    (1, 'Basic', 0.00, TRUE),
    (3, 'Premium Insights', 120.00, TRUE);

INSERT INTO plans (plan_name, price, billing_frequency, minimum_quantity, available_from, available_until, auto_close, allow_pause, allow_renewal, allow_early_closure, is_active)
VALUES
    ('Annual CRM Plan', 1299.00, 'YEARLY', 1, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '365 days', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('Growth Bundle', 720.00, 'MONTHLY', 1, CURRENT_DATE - INTERVAL '15 days', NULL, FALSE, TRUE, TRUE, FALSE, TRUE);

INSERT INTO plan_items (plan_id, product_id, variant_id, quantity, unit_price)
VALUES
    (1, 1, 1, 1, 1199.00),
    (1, 2, NULL, 1, 240.00),
    (2, 1, 2, 1, 420.00),
    (2, 3, NULL, 1, 300.00);

INSERT INTO quotation_templates (template_name, validity_days, is_active)
VALUES
    ('Standard Subscription Proposal', 30, TRUE),
    ('Enterprise Renewal Template', 45, TRUE);

INSERT INTO quotation_template_items (template_id, product_id, plan_id, quantity, unit_price)
VALUES
    (1, 1, NULL, 1, 950.00),
    (1, 2, NULL, 1, 240.00),
    (2, NULL, 1, 1, 1299.00);

INSERT INTO taxes (tax_name, tax_rate, is_active, effective_from, effective_until)
VALUES
    ('GST', 0.1000, TRUE, NOW() - INTERVAL '1 year', NULL),
    ('VAT', 0.2000, TRUE, NOW() - INTERVAL '1 year', NULL);

INSERT INTO discounts (discount_name, discount_type, discount_value, minimum_purchase, minimum_quantity, starts_at, ends_at, usage_limit, usage_count, is_active)
VALUES
    ('Launch Discount', 'PERCENTAGE', 10.00, 500.00, 1, NOW() - INTERVAL '30 days', NOW() + INTERVAL '90 days', 50, 0, TRUE),
    ('Fixed Early Renewal', 'FIXED', 60.00, 0.00, 1, NOW() - INTERVAL '15 days', NOW() + INTERVAL '60 days', 20, 0, TRUE);

INSERT INTO discount_products (discount_id, product_id)
VALUES
    (1, 1),
    (1, 3),
    (2, 2);

INSERT INTO billing_runs (started_by, started_at, completed_at, status, processed_count, failed_count)
VALUES
    (1, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'COMPLETED', 42, 0);
