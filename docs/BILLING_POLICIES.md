# Billing policy defaults

These defaults make the current implementation predictable until the business owners approve different rules.

| Topic | Current rule |
| --- | --- |
| Time zone | Billing dates are interpreted in UTC. Event timestamps are stored as `TIMESTAMPTZ`; invoice periods use `DATE`. |
| Currency | New invoices default to `DEFAULT_CURRENCY` (`USD` by default). Amounts are stored to two decimal places. Stripe Checkout is limited to currencies with two minor-unit decimal places. |
| Plan price | `plans.price` is the complete recurring bundle price. `plan_items` are descriptive snapshots and do not add to the bundle total. |
| Tax | Tax rates are percentages, applied exclusively after discounts. Tax is rounded per invoice line to two decimal places. |
| Discounts | One discount may apply to an invoice. Discounts do not stack. Usage limits are locked and counted in the invoice transaction. |
| Renewal | The billing runner creates an invoice; it does not charge a saved payment method automatically. The customer pays using Stripe Checkout or finance records an external payment. |
| Failed payment | A failed Stripe attempt leaves the invoice open. A customer can retry after the prior Checkout session expires and its failure webhook arrives. There is no automated dunning schedule. |
| Payment allocation | Successful payments reduce one invoice balance. Partial payments are supported; overpayments are rejected. There is no customer credit balance. |
| Refunds | Refunds are separate ledger rows. Stripe refunds are requested through Stripe and completed/failed from signed webhooks. Refunding does not erase the original payment. |
| Cancellation and proration | Closing a subscription stops future billing. Existing invoices remain payable. The system does not prorate or refund unused time. |
| Pause and resume | Pause preserves `next_billing_at`; resuming a subscription with a past billing date makes it eligible on the next billing run. |
| Roles | Customers manage their own subscriptions and pay their invoices. Staff manage catalog, plans, quotations, subscriptions, invoice generation and billing runs. Admins additionally manage users, taxes, discounts and refunds. |

These are implementation defaults, not accounting or legal advice. Confirm them with the business before production use, especially local tax rules, refund obligations, payment retries and currency support.
