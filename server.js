require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');

// Built-in menu to prevent missing module errors
const MENU = {
  item1: { name: "Chicken Biryani", price: 250 },
  item2: { name: "Paneer Tikka", price: 200 },
  item3: { name: "Veg Fried Rice", price: 180 },
  item4: { name: "Butter Naan", price: 40 },
  item5: { name: "Coke (500ml)", price: 60 }
};

const PORT = process.env.PORT || 3000;
const KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
const ORDERS_API_URL = (process.env.ORDERS_API_URL || '').trim();
const ORDERS_API_TOKEN = (process.env.ORDERS_API_TOKEN || '').trim();
const KEYS_OK = !!KEY_ID && !!KEY_SECRET && !/PASTE_|YOUR_|REPLACE/i.test(KEY_ID + KEY_SECRET);
const rzp = KEYS_OK ? new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET }) : null;

const bad = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* ---------- durable local order store (atomic JSON file) ---------- */
const DB_FILE = path.join(__dirname, 'data', 'orders.json');
let db = {};
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = {}; }
function persist() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const findByRzpOrder = (id) => Object.values(db).find((o) => o.payment.razorpayOrderId === id);

/* ---------- authoritative pricing (server side, rupees -> paise) ---------- */
function price(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw bad('Your cart is empty.');
  const merged = {};
  for (const it of items) {
    if (!it || !MENU[it.productId]) throw bad('Invalid product in cart.');
    const q = Number(it.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 50) throw bad('Invalid quantity.');
    merged[it.productId] = (merged[it.productId] || 0) + q;
  }
  const lines = Object.entries(merged).map(([id, quantity]) => ({
    productId: id, name: MENU[id].name, quantity, unitPrice: MENU[id].price, lineTotal: MENU[id].price * quantity
  }));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const deliveryFee = subtotal > 1000 ? 0 : 50;
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + deliveryFee + tax;
  return { items: lines, subtotal, deliveryFee, tax, total, amountPaise: total * 100 };
}

/* ---------- push paid orders to YOUR orders API (with auto retry) ---------- */
const syncing = new Set();
async function sync(o) {
  if (!ORDERS_API_URL) { o.sync = 'local_only'; o.status = 'confirmed'; persist(); return; }
  if (syncing.has(o.orderId)) return;
  syncing.add(o.orderId);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': o.orderId };
    if (ORDERS_API_TOKEN) headers.Authorization = 'Bearer ' + ORDERS_API_TOKEN;
    const r = await fetch(ORDERS_API_URL, {
      method: 'POST', headers, signal: ctl.signal,
      body: JSON.stringify({
        orderId: o.orderId, customer: o.customer, items: o.items, subtotal: o.subtotal,
        deliveryFee: o.deliveryFee, tax: o.tax, total: o.total, currency: 'INR',
        payment: { provider: 'razorpay', status: 'paid', ...o.payment }, createdAt: o.createdAt, paidAt: o.paidAt
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    o.sync = 'synced'; o.syncError = null; o.status = 'confirmed';
  } catch (e) {
    o.sync = 'failed'; o.syncError = e.message; o.syncTries = (o.syncTries || 0) + 1;
    console.error(`[orders-api] ${o.orderId} sync failed (${e.message}) - will retry automatically`);
  } finally {
    clearTimeout(timer); syncing.delete(o.orderId); persist();
  }
}
async function markPaid(o, paymentId) {
  if (o.status === 'paid' || o.status === 'confirmed') return;
  o.payment.razorpayPaymentId = paymentId;
  o.payment.status = 'paid';
  o.status = 'paid';
  o.paidAt = new Date().toISOString();
  persist();
  await sync(o);
}
async function retryPending() {
  for (const o of Object.values(db)) {
    if (o.payment.status === 'paid' && o.sync !== 'synced' && o.sync !== 'local_only') await sync(o);
  }
}
setInterval(retryPending, 60 * 1000);

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);

// Webhook needs the RAW body for signature check, so it is registered before express.json()
app.post('/api/payments/webhook', express.raw({ type: '*/*' }), wrap(async (req, res) => {
  if (!WEBHOOK_SECRET) return res.json({ status: 'webhook not enabled' });
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.body).digest('hex');
  if (!safeEq(expected, req.get('x-razorpay-signature') || '')) return res.status(400).json({ success: false, error: 'Invalid signature' });
  const ev = JSON.parse(req.body.toString('utf8'));
  if (ev.event === 'payment.captured' || ev.event === 'order.paid') {
    const p = ev.payload.payment.entity;
    const o = findByRzpOrder(p.order_id);
    if (o && o.amountPaise === p.amount) await markPaid(o, p.id);
  }
  res.json({ status: 'ok' });
}));

app.use(express.json({ limit: '50kb' }));

const hits = new Map();
function limiter(req, res, next) {
  const now = Date.now(), h = hits.get(req.ip) || { n: 0, t: now };
  if (now - h.t > 60000) { h.n = 0; h.t = now; }
  h.n++; hits.set(req.ip, h);
  if (h.n > 30) return res.status(429).json({ success: false, error: 'Too many requests. Please wait a minute.' });
  next();
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', razorpayKeys: KEYS_OK, ordersApi: ORDERS_API_URL || 'not set (local only)' }));
app.get('/api/menu', (req, res) => res.json({ success: true, menu: MENU }));

app.post('/api/payments/create-order', limiter, wrap(async (req, res) => {
  if (!KEYS_OK) throw bad('Razorpay keys are not set. Open the .env file, paste your Key ID and Secret, then restart the server.', 503);
  const c = req.body.customer || {};
  const customer = {
    name: String(c.name || '').trim(), phone: String(c.phone || '').trim(),
    email: String(c.email || '').trim(), address: String(c.address || '').trim()
  };
  if (customer.name.length < 2 || customer.name.length > 80) throw bad('Please enter your name.');
  if (!/^\d{10}$/.test(customer.phone)) throw bad('Enter a valid 10-digit mobile number.');
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) throw bad('Enter a valid email or leave it empty.');
  if (customer.address.length < 5 || customer.address.length > 300) throw bad('Please enter your delivery address.');

  const cart = price(req.body.items);
  const orderId = 'PARADISE_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex').toUpperCase();
  let rzOrder;
  try {
    rzOrder = await rzp.orders.create({ amount: cart.amountPaise, currency: 'INR', receipt: orderId });
  } catch (e) {
    console.error('[razorpay]', e.error || e);
    throw bad(e.statusCode === 401 ? 'Razorpay rejected your keys. Check Key ID and Secret in .env.' : 'Could not start payment: ' + ((e.error && e.error.description) || 'try again'), 502);
  }
  db[orderId] = {
    orderId, customer, items: cart.items, subtotal: cart.subtotal, deliveryFee: cart.deliveryFee, tax: cart.tax,
    total: cart.total, amountPaise: cart.amountPaise, status: 'pending_payment', sync: 'pending',
    payment: { razorpayOrderId: rzOrder.id, razorpayPaymentId: null, status: 'pending' }, createdAt: new Date().toISOString()
  };
  persist();
  res.json({ success: true, orderId, razorpayOrderId: rzOrder.id, amount: cart.amountPaise, currency: 'INR', keyId: KEY_ID });
}));

app.post('/api/payments/verify', limiter, wrap(async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) throw bad('Missing payment details.');
  const o = db[orderId];
  if (!o) throw bad('Order not found.', 404);
  if (o.payment.razorpayOrderId !== razorpayOrderId) throw bad('Order mismatch.');
  if (o.status === 'paid' || o.status === 'confirmed') return res.json({ success: true, message: 'Order confirmed.', orderId });
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(razorpayOrderId + '|' + razorpayPaymentId).digest('hex');
  if (!safeEq(expected, razorpaySignature)) {
    o.payment.status = 'failed'; o.status = 'payment_failed'; persist();
    throw bad('Payment signature verification failed.');
  }
  await markPaid(o, razorpayPaymentId);
  res.json({
    success: true, orderId,
    message: o.sync === 'failed' ? 'Payment received. Your order is saved and will be confirmed shortly.' : 'Payment verified. Your order is confirmed!'
  });
}));

app.get('/api/orders/:id/status', wrap(async (req, res) => {
  const o = db[req.params.id];
  if (!o) throw bad('Order not found.', 404);
  res.json({ success: true, orderId: o.orderId, status: o.status, total: o.total, items: o.items, createdAt: o.createdAt });
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  if (!err.statusCode) console.error(err);
  res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`\n  PARADISE running  ->  http://localhost:${PORT}`);
  console.log('  Razorpay keys     : ' + (KEYS_OK ? 'OK (' + (KEY_ID.startsWith('rzp_live') ? 'LIVE' : 'TEST') + ' mode)' : 'NOT SET - edit .env'));
  console.log('  Orders API        : ' + (ORDERS_API_URL || 'not set - orders saved in data/orders.json only') + '\n');
  retryPending();
});
