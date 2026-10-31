# Brightloop Subscription Management Database

This directory contains the PostgreSQL database schema, seed data, and backend-ready helper views/functions for the subscription management system described in the PDF architecture.

## Files

- `migrations/001_schema.sql` — full PostgreSQL schema with enums, tables, constraints, indexes, and triggers.
- `migrations/002_seed.sql` — sample tenant, user, product, plan, tax, and discount data.
- `migrations/003_backend_helpers.sql` — backend-friendly views and helper functions for customer data, outstanding balances, overdue invoices, and discount checks.
- `init_db.ps1` — PowerShell helper to drop/create the database and run all migration files.
- `schema.sql` and `seed.sql` — static copies kept for direct use or quick manual application.

## Local setup

From the project root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\init_db.ps1
```

This will create or reset the database called `subscription_management` and apply the schema, sample seed data, and helper SQL objects.

## Default connection

```text
postgresql://postgres:postgres@localhost:5432/subscription_management
```

## Core entity groups

- Identity & access: customers, users, password_reset_tokens
- Products & pricing: products, product_variants, plans, plan_items
- Quotes: quotation_templates, quotation_template_items, quotations, quotation_items
- Subscriptions: subscriptions, subscription_items
- Billing: invoices, invoice_items, payments, payment_refunds, taxes
- Discounts and audit: discounts, discount_products, discount_usages, audit_logs, billing_runs

## Backend-ready views and helpers

The database includes these reusable SQL objects so backend engineers can query from API endpoints without re-implementing aggregation logic:

- `v_customer_subscriptions` — customer and subscription summary.
- `v_invoice_balance` — invoice totals, payments, refunds, outstanding amount.
- `v_overdue_invoices` — invoice queue for finance dashboards.
- `v_discount_usage_status` — discount availability and remaining usage.
- `fn_invoice_outstanding(invoice_id)` — returns outstanding balance for a single invoice.
- `fn_discount_can_apply(discount_id, product_id)` — checks rule availability for a discount and product.
- `fn_subscription_status_count(customer_id, status)` — returns subscription counts by status.

## Common backend queries

```sql
SELECT * FROM v_customer_subscriptions WHERE customer_id = 1;
SELECT * FROM v_invoice_balance WHERE customer_id = 1 ORDER BY invoice_id DESC;
SELECT * FROM v_overdue_invoices;
SELECT * FROM v_discount_usage_status WHERE is_active = TRUE;
SELECT fn_invoice_outstanding(1);
```

## Notes for the backend team

- Use the authenticated user's `customer_id` to scope every customer-facing query.
- Treat `payments` and `payment_refunds` as immutable financial history.
- Use the `invoice`/`subscription` snapshots to preserve historical price and tax details.
- Use `UNIQUE` keys and transactional billing logic when generating invoices and processing recurring billing.