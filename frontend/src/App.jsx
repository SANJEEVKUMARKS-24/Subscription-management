import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown,
  CircleHelp, CreditCard, Download, FileText, LayoutDashboard, LifeBuoy,
  LoaderCircle, LogOut, Menu, Package, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Users, X,
} from 'lucide-react';
import { api, idempotencyKey, money, session, unwrap } from './api';

const NAV = [
  { title: 'Workspace', items: [
    { id: 'Overview', icon: LayoutDashboard }, { id: 'Subscriptions', icon: Activity },
    { id: 'Invoices', icon: FileText }, { id: 'Plans', icon: Package },
  ] },
];
const titleCase = (value = '') => String(value).toLowerCase().replace(/(^|_)\w/g, (word) => word.replace('_', ' ').toUpperCase());
const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const getArray = (payload) => unwrap(payload);
const getRows = (payload) => payload?.data?.data || payload?.data || payload || {};

function App() {
  const [user, setUser] = useState(session.user());
  const [page, setPage] = useState('Overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [newSubscriptionOpen, setNewSubscriptionOpen] = useState(false);
  const notify = useCallback((message) => { setToast(message); window.setTimeout(() => setToast(''), 3600); }, []);
  const logout = () => { session.clear(); setUser(null); };
  const onLogin = (data) => { session.save(data); setUser(data.user); };
  const reload = () => setRefreshKey((key) => key + 1);
  const startNewSubscription = () => {
    if (user.role === 'CUSTOMER') { setPage('Plans'); return; }
    setPage('Subscriptions');
    setNewSubscriptionOpen(true);
  };

  if (!user) return <Login onLogin={onLogin} />;
  return (
    <div className="app-shell">
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage('Overview'); }}>
          <span className="brand-mark"><Sparkles size={18} /></span><span>subscript<span className="brand-dot">.</span></span>
        </a>
        <div className="workspace-switcher"><span className="workspace-avatar">{(user.fullName || user.full_name || user.email || 'S')[0].toUpperCase()}</span><span className="workspace-name"><strong>{user.companyName || 'Workspace'}</strong><small>Subscription portal</small></span><ChevronDown size={15} /></div>
        <div className="nav-label">MENU</div>
        {NAV.map((group) => <div className="nav-group" key={group.title}>{group.items.map(({ id, icon: Icon }) => <button key={id} onClick={() => { setPage(id); setMobileNav(false); }} className={`nav-item ${page === id ? 'active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{id}</span>{id === 'Invoices' && <span className="nav-count">•</span>}</button>)}</div>)}
        {user.role !== 'CUSTOMER' && <><div className="nav-label nav-label-spaced">MANAGE</div><button className={`nav-item ${page === 'Customers' ? 'active' : ''}`} onClick={() => setPage('Customers')}><Users size={18} strokeWidth={1.8} /><span>Customers</span></button><button className={`nav-item ${page === 'Settings' ? 'active' : ''}`} onClick={() => setPage('Settings')}><Settings2 size={18} strokeWidth={1.8} /><span>Settings</span></button></>}
        <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><LifeBuoy size={17} /></div><strong>Need a hand?</strong><p>Our team is here if you need anything.</p><a href="mailto:support@example.com">Get support <ArrowRight size={13} /></a></div><div className="profile"><span className="profile-avatar">{(user.fullName || user.full_name || user.email || 'U')[0].toUpperCase()}</span><span className="profile-info"><strong>{user.fullName || user.full_name || user.email}</strong><small>{titleCase(user.role)}</small></span><button aria-label="Sign out" className="icon-button profile-logout" onClick={logout}><LogOut size={16} /></button></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page}</strong></div><div className="top-actions"><span className="secure-label"><ShieldCheck size={15} /> Secure workspace</span><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button><span className="top-avatar">{(user.fullName || user.full_name || user.email || 'U')[0].toUpperCase()}</span></div></header>
        <section className="content"><PageContent page={page} user={user} refreshKey={refreshKey} notify={notify} reload={reload} setPage={setPage} newSubscriptionOpen={newSubscriptionOpen} setNewSubscriptionOpen={setNewSubscriptionOpen} startNewSubscription={startNewSubscription} /></section>
      </main>
      {toast && <div className="toast"><span><Check size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', fullName: '', companyName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'register') {
        const result = await api('/register', { method: 'POST', body: JSON.stringify(form) });
        onLogin(result.data);
      } else if (mode === 'reset') {
        await api('/password-reset/request', { method: 'POST', body: JSON.stringify({ email: form.email }) });
        setNotice('If an account exists, reset instructions have been sent.');
      } else {
        const result = await api('/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) });
        onLogin(result.data);
      }
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <div className="login-page"><div className="login-art"><div className="login-art-top"><a className="brand brand-light" href="#"><span className="brand-mark"><Sparkles size={18} /></span><span>subscript<span className="brand-dot">.</span></span></a><span className="login-pill"><span /> BUILT FOR RECURRING REVENUE</span></div><div className="art-copy"><span className="eyebrow light-eyebrow">THE CALMER WAY TO GROW</span><h1>Every subscriber.<br />Every detail.<br /><em>In sync.</em></h1><p>All your plans, payments, and customer relationships in one thoughtfully simple workspace.</p><div className="art-stat"><div className="stat-avatars"><i>J</i><i>A</i><i>M</i><i>+</i></div><span>Built for teams who care<br />about the details.</span></div></div><div className="art-footer"><span>© 2025 Subscript Inc.</span><span>Made for steady growth <Sparkles size={13} /></span></div><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-glow" /></div><div className="login-panel"><div className="login-panel-inner"><div className="mobile-brand"><a className="brand" href="#"><span className="brand-mark"><Sparkles size={18} /></span><span>subscript<span className="brand-dot">.</span></span></a></div><div className="login-heading"><span className="eyebrow">WELCOME TO SUBSCRIPT</span><h2>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Good to see you.'}</h2><p>{mode === 'register' ? 'Start managing your subscriptions today.' : mode === 'reset' ? 'We’ll send you a link to get back in.' : 'Sign in to your workspace to continue.'}</p></div><form onSubmit={submit} className="login-form">{mode === 'register' && <><label>Your name<input required autoComplete="name" value={form.fullName} onChange={change('fullName')} placeholder="Jordan Lee" /></label><label>Company name<input required value={form.companyName} onChange={change('companyName')} placeholder="Acme Studio" /></label></>}<label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@company.com" /></label>{mode !== 'reset' && <label>Password<input required minLength={mode === 'register' ? 12 : undefined} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={change('password')} placeholder={mode === 'register' ? 'At least 12 characters' : 'Enter your password'} /></label>}{error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}<button className="button button-primary login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : mode === 'reset' ? 'Send reset link' : mode === 'register' ? 'Create account' : 'Sign in'}{!busy && <ArrowRight size={16} />}</button></form><div className="login-switch">{mode === 'login' && <button onClick={() => setMode('reset')}>Forgot password?</button>}{mode === 'reset' ? <span>Remember your password? <button onClick={() => setMode('login')}>Sign in</button></span> : mode === 'register' ? <span>Already have an account? <button onClick={() => setMode('login')}>Sign in</button></span> : <span>New to Subscript? <button onClick={() => setMode('register')}>Create an account</button></span>}</div><div className="login-terms">By continuing, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</div><div className="login-help"><CircleHelp size={15} /> Need help? <a href="mailto:support@example.com">Contact support</a></div></div></div></div>;
}

function PageContent({ page, user, refreshKey, notify, reload, setPage, newSubscriptionOpen, setNewSubscriptionOpen, startNewSubscription }) {
  if (page === 'Overview') return <Dashboard user={user} refreshKey={refreshKey} setPage={setPage} onNewSubscription={startNewSubscription} />;
  if (page === 'Subscriptions') return <Subscriptions user={user} refreshKey={refreshKey} notify={notify} reload={reload} createOpen={newSubscriptionOpen} setCreateOpen={setNewSubscriptionOpen} />;
  if (page === 'Invoices') return <Invoices user={user} refreshKey={refreshKey} notify={notify} />;
  if (page === 'Plans') return <Plans user={user} refreshKey={refreshKey} notify={notify} />;
  if (page === 'Customers') return <Customers user={user} />;
  return <SettingsPage user={user} />;
}

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, error: '', value: null });
  const key = JSON.stringify(deps);
  useEffect(() => { let active = true; setState({ loading: true, error: '', value: null }); loader().then((value) => active && setState({ loading: false, error: '', value })).catch((error) => active && setState({ loading: false, error: error.message, value: null })); return () => { active = false; }; }, [key]);
  return state;
}

function Dashboard({ user, refreshKey, setPage, onNewSubscription }) {
  const overview = useLoad(async () => Promise.all([api('/dashboard/summary'), api('/subscriptions?limit=5'), api('/invoices?limit=5')]), [refreshKey]);
  const [stats, subs, invoices] = overview.value || [];
  const summary = stats?.data || {};
  const subscriptionRows = getArray(subs);
  const invoiceRows = getArray(invoices);
  return <><div className="page-head"><div><span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span><h1>Good {greeting()}, {firstName(user)} <span className="wave">✳</span></h1><p>Here’s what’s happening with your subscriptions.</p></div><button className="button button-primary" onClick={onNewSubscription}><Plus size={16} /> {user.role === 'CUSTOMER' ? 'Browse plans' : 'New subscription'}</button></div>{overview.error && <ErrorBanner message={overview.error} />}<div className="metric-grid"><Metric title="Active subscriptions" value={summary.active_subscriptions ?? '—'} icon={Activity} trend="All active plans" tone="mint" /><Metric title="Total invoiced" value={summary.invoiced_total === undefined ? '—' : money(summary.invoiced_total)} icon={ArrowUpRight} trend="Across all invoices" tone="lavender" /><Metric title="Revenue this month" value={summary.revenue_this_month === undefined ? '—' : money(summary.revenue_this_month)} icon={ArrowDownLeft} trend="Payments received" tone="peach" /><Metric title="Outstanding" value={summary.outstanding_total === undefined ? '—' : money(summary.outstanding_total)} icon={CreditCard} trend={`${summary.overdue_invoices ?? 0} overdue invoices`} tone="blue" /></div><div className="dashboard-grid"><section className="panel recent-panel"><div className="panel-head"><div><span className="eyebrow">YOUR BUSINESS</span><h2>Recent subscriptions</h2></div><button className="text-action" onClick={() => setPage('Subscriptions')}>View all <ArrowRight size={14} /></button></div>{overview.loading ? <Loading /> : overview.error ? null : <SubscriptionTable rows={subscriptionRows.slice(0, 5)} compact />}</section><section className="panel invoice-panel"><div className="panel-head"><div><span className="eyebrow">KEEP THINGS MOVING</span><h2>Recent invoices</h2></div><button className="text-action" onClick={() => setPage('Invoices')}>View all <ArrowRight size={14} /></button></div>{overview.loading ? <Loading /> : overview.error ? null : invoiceRows.length ? <div className="mini-list">{invoiceRows.slice(0, 4).map((invoice) => <div className="mini-row" key={invoice.invoice_id}><div className="doc-icon"><FileText size={17} /></div><div className="mini-detail"><strong>{invoice.invoice_number || `Invoice #${invoice.invoice_id}`}</strong><small>{dateLabel(invoice.invoice_date)}</small></div><div className="mini-amount"><strong>{money(invoice.total_amount, invoice.currency || 'USD')}</strong><Status value={invoice.status} /></div></div>)}</div> : <Empty title="No invoices just yet" text="Your invoices will show up here." />}</section></div><div className="bottom-note"><span className="note-icon"><Sparkles size={17} /></span><div><strong>A little more clarity, every day.</strong><p>Your subscription workspace is up to date. Nice work.</p></div><span className="note-decoration">✦</span></div></>;
}

function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'; }
function firstName(user) { return (user.fullName || user.full_name || user.email || 'there').split(/[ @]/)[0]; }
function Metric({ title, value, icon: Icon, trend, tone }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.9} /></div><span className="metric-title">{title}</span><strong className="metric-value">{value}</strong><span className="metric-trend"><i />{trend}</span></div>; }

function Subscriptions({ user, refreshKey, notify, reload, createOpen, setCreateOpen }) {
  const [filter, setFilter] = useState('All subscriptions');
  const [search, setSearch] = useState('');
  const state = useLoad(() => api('/subscriptions?limit=100'), [refreshKey]);
  const rows = useMemo(() => getArray(state.value).filter((row) => (filter === 'All subscriptions' || String(row.status).toLowerCase() === filter.toLowerCase()) && `${row.subscription_number || ''} ${row.customer_name || ''} ${row.plan_name || ''}`.toLowerCase().includes(search.toLowerCase())), [state.value, filter, search]);
  async function activateSubscription(subscription) {
    try {
      await api(`/subscriptions/${subscription.subscription_id}/activate`, { method: 'POST' });
      notify('Subscription activated.');
      reload();
    } catch (error) { notify(error.message); }
  }
  async function closeSubscription(subscription) {
    const name = subscription.subscription_number || `Subscription ${subscription.subscription_id}`;
    if (!window.confirm(`Close ${name}? The subscription and billing history will remain available.`)) return;
    try {
      await api(`/subscriptions/${subscription.subscription_id}`, { method: 'DELETE' });
      notify('Subscription closed. Its history has been kept.');
      reload();
    } catch (error) { notify(error.message); }
  }
  return <><div className="page-head"><div><span className="eyebrow">YOUR CUSTOMER BASE</span><h1>Subscriptions</h1><p>Keep track of plans, status, and billing dates.</p></div>{user.role !== 'CUSTOMER' && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> New subscription</button>}</div>{createOpen && user.role !== 'CUSTOMER' && <CreateSubscription refreshKey={refreshKey} onClose={() => setCreateOpen(false)} onCreated={(message) => { setCreateOpen(false); notify(message); reload(); }} />}<div className="toolbar"><div className="search-box"><Search size={16} /><input placeholder="Search subscriptions" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All subscriptions</option><option>DRAFT</option><option>ACTIVE</option><option>CONFIRMED</option><option>PAUSED</option><option>CLOSED</option></select><span className="result-count">{rows.length} subscriptions</span></div>{state.error && <ErrorBanner message={state.error} />}{state.loading ? <Loading /> : state.error ? null : rows.length ? <div className="panel table-panel"><SubscriptionTable rows={rows} canManage={user.role !== 'CUSTOMER'} canClose onActivate={activateSubscription} onCloseSubscription={closeSubscription} /></div> : <Empty title="No subscriptions found" text="Create one with the button above or accept a quotation." />}</>;
}

function CreateSubscription({ refreshKey, onClose, onCreated }) {
  const [planRefresh, setPlanRefresh] = useState(0);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const options = useLoad(() => Promise.all([api('/customers?limit=100'), api('/plans?limit=100')]), [refreshKey, planRefresh]);
  const customers = getArray(options.value?.[0]);
  const plans = getArray(options.value?.[1]);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ customerId: '', planId: '', startDate: today, expiryDate: '', paymentTermsDays: '0' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/subscriptions', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          customerId: Number(form.customerId),
          planId: Number(form.planId),
          startDate: form.startDate,
          ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
          paymentTermsDays: Number(form.paymentTermsDays),
        }),
      });
      onCreated('Draft subscription created. You can review it in the subscriptions list.');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <section className="panel create-subscription-panel">
    <div className="panel-head"><div><span className="eyebrow">NEW SUBSCRIPTION</span><h2>Choose a customer and plan</h2></div><button className="icon-button" type="button" aria-label="Close form" onClick={onClose}><X size={17} /></button></div>
    {options.loading ? <Loading /> : options.error ? <ErrorBanner message={options.error} /> : !customers.length ? <div className="create-subscription-empty">There are no active customers yet. Register a customer account first.</div> : !plans.length ? <div className="create-subscription-empty"><p>There are no active plans yet. Create a plan before adding its subscription.</p>{showPlanForm ? <CreatePlanInline onCancel={() => setShowPlanForm(false)} onCreated={(plan) => { setForm((current) => ({ ...current, planId: String(plan.plan_id) })); setShowPlanForm(false); setPlanRefresh((key) => key + 1); }} /> : <button className="button button-secondary" type="button" onClick={() => setShowPlanForm(true)}><Plus size={14} /> Create a plan</button>}</div> : <form className="subscription-form" onSubmit={submit}>
      <label>Customer<select required value={form.customerId} onChange={setField('customerId')}><option value="">Select a customer</option>{customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.company_name} — {customer.email}</option>)}</select></label>
      <label>Plan<select required value={form.planId} onChange={setField('planId')}><option value="">Select a plan</option>{plans.map((plan) => <option key={plan.plan_id} value={plan.plan_id}>{plan.plan_name || plan.name} — {money(plan.price)} / {String(plan.billing_frequency || '').toLowerCase()}</option>)}</select></label>
      <label>Start date<input required type="date" value={form.startDate} onChange={setField('startDate')} /></label>
      <label>Expiry date <span className="optional-label">Optional</span><input type="date" min={form.startDate} value={form.expiryDate} onChange={setField('expiryDate')} /></label>
      <label>Payment terms (days)<input required type="number" min="0" step="1" value={form.paymentTermsDays} onChange={setField('paymentTermsDays')} /></label>
      {error && <div className="form-error subscription-form-error">{error}</div>}
      <div className="subscription-form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}{busy ? 'Creating…' : 'Create draft'}</button></div>
    </form>}
  </section>;
}

function CreatePlanInline({ onCancel, onCreated }) {
  const [form, setForm] = useState({ name: '', price: '', billingFrequency: 'MONTHLY', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/plans', { method: 'POST', body: JSON.stringify({ ...form, price: Number(form.price) }) });
      onCreated(result.data);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <form className="subscription-form inline-plan-form" onSubmit={submit}>
    <label>Plan name<input required maxLength="255" value={form.name} onChange={setField('name')} placeholder="Monthly service" /></label>
    <label>Price<input required type="number" min="0" step="0.01" value={form.price} onChange={setField('price')} placeholder="49.00" /></label>
    <label>Billing frequency<select value={form.billingFrequency} onChange={setField('billingFrequency')}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option><option value="WEEKLY">Weekly</option><option value="DAILY">Daily</option></select></label>
    <label>Description<input maxLength="500" value={form.description} onChange={setField('description')} placeholder="Optional details" /></label>
    {error && <div className="form-error subscription-form-error">{error}</div>}
    <div className="subscription-form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button></div>
  </form>;
}

function SubscriptionTable({ rows, compact = false, canManage = false, canClose = false, onActivate, onCloseSubscription }) {
  if (!rows.length) return <Empty title="No subscriptions yet" text="Once you have a subscription, it will show here." />;
  return <div className="table-wrap"><table><thead><tr><th>SUBSCRIPTION</th><th>PLAN</th><th>STATUS</th><th>{compact ? 'NEXT BILLING' : 'START DATE'}</th><th className="align-right">AMOUNT</th>{(canManage || canClose) && !compact && <th>ACTIONS</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.subscription_id}><td><div className="table-primary"><span className="table-avatar">{(row.subscription_number || 'S')[0]}</span><span><strong>{row.subscription_number || `SUB-${row.subscription_id}`}</strong><small>{row.customer_name || row.company_name || `Customer #${row.customer_id}`}</small></span></div></td><td>{row.plan_name || `Plan #${row.plan_id}`}</td><td><Status value={row.status} /></td><td>{dateLabel(compact ? row.next_billing_at : row.start_date)}</td><td className="align-right amount-cell">{row.price ? money(row.price) : row.total_amount ? money(row.total_amount) : '—'}</td>{(canManage || canClose) && !compact && <td className="align-right subscription-actions">{canManage && row.status === 'DRAFT' && <button type="button" className="text-action" onClick={() => onActivate(row)}>Activate</button>}{canClose && row.status !== 'CLOSED' && <button type="button" className="text-action close-subscription-action" onClick={() => onCloseSubscription(row)}>Close</button>}</td>}</tr>)}</tbody></table></div>;
}

function Invoices({ user, refreshKey, notify }) {
  const state = useLoad(() => api('/invoices?limit=100'), [refreshKey]);
  const rows = getArray(state.value);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') notify('Payment submitted. Your invoice status will update after provider confirmation.');
    else if (params.get('checkout') === 'cancelled') notify('Checkout was cancelled. Your invoice is still open.');
    if (params.has('checkout')) window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
  }, [notify]);
  async function payInvoice(invoice) {
    try {
      const result = await api(`/invoices/${invoice.invoice_id}/checkout`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({}) });
      window.location.assign(result.data.checkoutUrl);
    } catch (error) { notify(error.message); }
  }
  return <><div className="page-head"><div><span className="eyebrow">BILLING & PAYMENTS</span><h1>Invoices</h1><p>A clear view of every charge and payment.</p></div><button className="button button-secondary" onClick={() => window.print()}><Download size={15} /> Export list</button></div><div className="toolbar"><div className="search-box"><Search size={16} /><input placeholder="Search by invoice number" /></div><button className="filter-button"><span className="filter-dot" /> All statuses <ChevronDown size={15} /></button><span className="result-count">{rows.length} invoices</span></div>{state.error && <ErrorBanner message={state.error} />}{state.loading ? <Loading /> : rows.length ? <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>INVOICE</th><th>ISSUED</th><th>DUE DATE</th><th>STATUS</th><th className="align-right">TOTAL</th>{user.role === 'CUSTOMER' && <th />}</tr></thead><tbody>{rows.map((row) => <tr key={row.invoice_id}><td><div className="table-primary"><span className="doc-icon"><FileText size={16} /></span><span><strong>{row.invoice_number || `INV-${row.invoice_id}`}</strong><small>{row.company_name || row.customer_name || `Customer #${row.customer_id}`}</small></span></div></td><td>{dateLabel(row.invoice_date)}</td><td>{dateLabel(row.due_date)}</td><td><Status value={row.status} /></td><td className="align-right amount-cell">{money(row.total_amount, row.currency || 'USD')}</td>{user.role === 'CUSTOMER' && <td className="align-right">{['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(row.status) && <button className="button button-primary pay-button" onClick={() => payInvoice(row)}>Pay online <ArrowRight size={13} /></button>}</td>}</tr>)}</tbody></table></div></div> : <Empty title="No invoices yet" text="Invoices appear here when a subscription is billed." />}</>;
}

function Plans({ user, refreshKey, notify }) {
  const state = useLoad(() => api('/plans?limit=100'), [refreshKey]);
  const plans = getArray(state.value);
  async function selectPlan(plan) {
    if (user.role !== 'CUSTOMER') { notify('Customer subscriptions are created when they accept a quotation.'); return; }
    try {
      await api('/subscriptions', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ planId: plan.plan_id }) });
      notify('Subscription request created. Your workspace team can activate it.');
    } catch (error) { notify(error.message); }
  }
  return <><div className="page-head"><div><span className="eyebrow">FIND YOUR FIT</span><h1>Plans</h1><p>Simple options for what you need, with room to grow.</p></div>{user.role !== 'CUSTOMER' && <span className="role-chip"><ShieldCheck size={14} /> Plans are managed by your workspace team</span>}</div>{state.error && <ErrorBanner message={state.error} />}{state.loading ? <Loading /> : plans.length ? <div className="plan-grid">{plans.map((plan, index) => <article className={`plan-card ${index === 1 ? 'plan-featured' : ''}`} key={plan.plan_id}><div className="plan-card-top"><span className="plan-mark">{index === 1 ? <Sparkles size={18} /> : <Package size={18} />}</span>{index === 1 && <span className="popular-label">MOST POPULAR</span>}</div><h2>{plan.plan_name || plan.name}</h2><p>{plan.description || 'A flexible plan to help you get more from your subscription.'}</p><div className="plan-price">{money(plan.price)}<span> / {String(plan.billing_frequency || 'month').toLowerCase()}</span></div><div className="plan-divider" /><div className="plan-perks"><span><Check size={15} /> Flexible billing</span><span><Check size={15} /> Dedicated support</span><span><Check size={15} /> Easy to manage</span></div>{user.role === 'CUSTOMER' && <button className={`button ${index === 1 ? 'button-primary' : 'button-secondary'} plan-cta`} onClick={() => selectPlan(plan)}>Choose plan <ArrowRight size={15} /></button>}</article>)}</div> : <Empty title="No active plans available" text={user.role === 'CUSTOMER' ? 'Ask your workspace administrator to add a plan. Then you can choose it here to request a subscription.' : 'Create a plan from New subscription before adding a subscription.'} />}</>;
}

function Customers({ user }) {
  return <><div className="page-head"><div><span className="eyebrow">YOUR PEOPLE</span><h1>Customers</h1><p>Manage the people behind every subscription.</p></div></div><div className="panel placeholder-panel"><div className="placeholder-icon"><Users size={23} /></div><h2>Customer directory</h2><p>Customer records are created when an account registers. Choose a customer from the new subscription form to start a subscription.</p><span className="role-chip"><ShieldCheck size={14} /> {titleCase(user.role)} access</span></div></>;
}

function SettingsPage({ user }) { return <><div className="page-head"><div><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Your account and workspace information.</p></div></div><div className="panel settings-panel"><div className="settings-avatar">{(user.fullName || user.full_name || user.email || 'U')[0].toUpperCase()}</div><div className="setting-row"><span>Name</span><strong>{user.fullName || user.full_name || '—'}</strong></div><div className="setting-row"><span>Email</span><strong>{user.email}</strong></div><div className="setting-row"><span>Workspace role</span><strong>{titleCase(user.role)}</strong></div><div className="settings-foot">Account details are managed by your workspace administrator.</div></div></>; }

function Status({ value }) {
  const normalized = String(value || 'unknown').toLowerCase().replaceAll('_', '-');
  return <span className={`status status-${normalized}`}><i />{titleCase(value || 'Unknown')}</span>;
}
function Loading() { return <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>Loading your workspace…</span></div>; }
function ErrorBanner({ message }) { return <div className="error-banner"><CircleHelp size={16} />{message}</div>; }
function Empty({ title, text }) { return <div className="empty-state"><span className="empty-icon"><FileText size={20} /></span><strong>{title}</strong><p>{text}</p></div>; }

export default App;
