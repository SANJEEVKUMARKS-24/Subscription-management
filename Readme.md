## TEAM MEMBERS 


## AJAY SANTHOSH ( UI / UX Designing Figma )
## SANJAY RAMASWAMY ( Frontend React.js)
## SANJEEV KUMAR ( DATABASE PostgreSQL)
## MOHAMMED FAHEEM K (BACKEND Node.js Express.js)

# Backend API

The Express API is a PostgreSQL-backed modular monolith. Copy `.env.example` to `.env`, set
`DATABASE_URL` and a unique `JWT_SECRET`, then initialize a fresh database:

```sh
npm install
npm run db:migrate
ADMIN_EMAIL=admin@example.com ADMIN_NAME="System Admin" ADMIN_PASSWORD="use-a-long-password" npm run db:create-admin
npm start
```

The migration runner excludes sample seed data. The separate `database/init_db.ps1` script drops and
recreates a local database; never run that destructive helper on a shared database.

For a local presentation, seed fictional customers, plans, subscriptions, invoices, and simulated
payments for one existing customer account:

```sh
DEMO_OWNER_NAME="Mohammed Faheem" npm run db:seed-demo
```

The demo seed is repeat-safe, uses `.example` emails, and records no real payments. Run it only against
your local demo database.

## Frontend

The React/Vite app lives in `frontend/`. Run the backend on port 5017, then start the frontend in a
second terminal:

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to `http://localhost:5017`; set
`VITE_API_URL` in `frontend/.env.local` if the API is hosted elsewhere. Sign in or register, then use
the sidebar to view the dashboard, subscriptions, invoices, and plans. The database must be running
and migrated for account and business data to load.

## API routes

- `GET /api/health` and `GET /api/health/ready`
- `POST /api/v1/register`, `/login`, `/password-reset/request`, `/password-reset/confirm`
- `GET|POST|PATCH|DELETE /api/v1/products` and `/api/v1/products/:productId/variants`
- `GET|POST|PATCH|DELETE /api/v1/plans` and `PUT /api/v1/plans/:planId/items`
- `GET|POST /api/v1/quotation-templates`; quotation list, detail, send, cancel and confirm routes
- Subscription create/list/detail/update, activate, pause, resume and close routes
- Invoice list/detail/generation; Stripe Checkout, refunds and signed payment webhooks
- Customer and discount management, `GET /api/v1/dashboard/summary`, and `POST /api/v1/billing-runs`

Closing a subscription uses `DELETE /api/v1/subscriptions/:id` and changes its status to `CLOSED`;
the subscription and invoice history are retained for billing records. The subscriptions screen asks
for confirmation before closing one.

Use an `Authorization: Bearer <token>` header for API routes other than registration, login, password
reset, health and signed webhooks. Writes that create subscriptions, quotations, invoices, payments, or
refunds require a unique `Idempotency-Key`. Customer users are scoped to their authenticated tenant.

Recurring billing can be invoked by `npm run billing:run` or scheduled externally. Configure
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `PUBLIC_APP_URL` for online payments. Add a Stripe
webhook endpoint at `/api/v1/webhooks/stripe` and subscribe to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `refund.updated`, and `refund.failed`. For local development, use
`stripe listen --forward-to localhost:5017/api/v1/webhooks/stripe` and put the CLI's `whsec_...`
secret in `STRIPE_WEBHOOK_SECRET`. Stripe's hosted Checkout page collects card details; the API marks
payments complete only after a verified webhook. See [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
and [Stripe API keys](https://docs.stripe.com/keys).

Password reset email can use Resend by setting `RESEND_API_KEY` and a verified `EMAIL_FROM` sender.
Alternatively, configure the generic mail endpoint with `EMAIL_API_URL` and `EMAIL_API_KEY`. The
Resend request follows its [official Node.js email API](https://resend.com/nodejs).

The billing, tax, cancellation, discount, currency and staff-permission defaults are recorded in
`docs/BILLING_POLICIES.md`.

## Integration checks

Create a dedicated local test database, set `TEST_DATABASE_URL` to it (the database name must contain
`test`), then run:

```sh
npm test
```

The suite applies migrations and creates disposable fixture rows in that dedicated database. It never
uses `DATABASE_URL` as its target.
