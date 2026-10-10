require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const mysql = require('mysql2');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

// Authoritative server-side rich menu items with prices, categories, emojis, and descriptions
const MENU = {
  'chicken-biryani': { 
    name: 'Chicken Biryani', 
    price: 1, 
    category: 'biryani', 
    emoji: '🍗', 
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    description: 'Tender chicken pieces marinated in secret royal spices, layered with aromatic basmati rice.' 
  },
  'mutton-biryani': { 
    name: 'Mutton Biryani', 
    price: 2, 
    category: 'biryani', 
    emoji: '🍖', 
    image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80',
    description: 'Juicy succulent pieces of tender mutton cooked traditionally with long-grain basmati rice.' 
  },
  'chicken-family-pack': { 
    name: 'Chicken Family Pack', 
    price: 3, 
    category: 'biryani', 
    emoji: '🍛', 
    image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80',
    description: 'Generous serving of our legendary Chicken Biryani, perfect for sharing with family and friends.' 
  },
  'mutton-family-pack': { 
    name: 'Mutton Family Pack', 
    price: 2, 
    category: 'biryani', 
    emoji: '🍛', 
    image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80',
    description: 'Grand celebration pack of our signature Mutton Biryani loaded with rich flavors and dry fruits.' 
  },
  'special-chicken-biryani': { 
    name: 'Special Chicken Biryani', 
    price: 2, 
    category: 'biryani', 
    emoji: '🍗', 
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    description: 'Extra portion of boneless chicken chunks cooked with rich saffron-infused basmati rice.' 
  },
  'special-mutton-biryani': { 
    name: 'Special Mutton Biryani', 
    price: 3, 
    category: 'biryani', 
    emoji: '🍖', 
    image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80',
    description: 'Chef special rich preparation of tender lamb meat blended with aromatic herbs and spices.' 
  },
  'supreme-chicken-biryani': { 
    name: 'Supreme Chicken Biryani', 
    price: 1, 
    category: 'biryani', 
    emoji: '👑', 
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    description: 'The ultimate royal feast featuring premium chicken cuts, rich ghee, and dry fruits.' 
  },
  'supreme-mutton-biryani': { 
    name: 'Supreme Mutton Biryani', 
    price: 819, 
    category: 'biryani', 
    emoji: '👑', 
    image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80',
    description: 'An unmatched masterpiece of royal Nizami heritage with premium tender mutton and rich spices.' 
  },
  'egg-biryani': { 
    name: 'Egg Biryani', 
    price: 154, 
    category: 'biryani', 
    emoji: '🥚', 
    image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80',
    description: 'Boiled farm-fresh eggs tossed in spicy masala and layered with fragrant basmati rice.' 
  },
  'veg-biryani': { 
    name: 'Veg. Biryani', 
    price: 175, 
    category: 'biryani', 
    emoji: '🥕', 
    image: 'https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?auto=format&fit=crop&w=600&q=80',
    description: 'Assorted fresh garden vegetables cooked with aromatic herbs, basmati rice, and mint.' 
  },
  'chilli-chicken': { 
    name: 'Chilli Chicken', 
    price: 264, 
    category: 'starters', 
    emoji: '🌶️', 
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Crispy fried chicken chunks tossed with bell peppers, green chillies, and tangy soy sauce.' 
  },
  'chicken-65': { 
    name: 'Chicken 65', 
    price: 264, 
    category: 'starters', 
    emoji: '🍗', 
    image: 'https://images.unsplash.com/photo-1610057099431-d7a8e57b3348?auto=format&fit=crop&w=600&q=80',
    description: 'South India’s legendary spicy, deep-fried chicken appetizer tempered with curry leaves.' 
  },
  'pepper-chicken': { 
    name: 'Pepper Chicken', 
    price: 264, 
    category: 'starters', 
    emoji: '🫚', 
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Juicy chicken pieces stir-fried with crushed black pepper, garlic, and onions.' 
  },
  'paneer-65': { 
    name: 'Paneer 65', 
    price: 196, 
    category: 'starters', 
    emoji: '🧀', 
    image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    description: 'Crispy cottage cheese cubes tossed in spicy yogurt-based South Indian seasoning.' 
  },
  'veg-manchurian': { 
    name: 'Veg. Manchurian', 
    price: 189, 
    category: 'starters', 
    emoji: '🥦', 
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    description: 'Savory vegetable dumplings deep-fried and simmered in a flavorful garlic-soy sauce.' 
  },
  'chicken-tikka-kebab': { 
    name: 'Chicken Tikka Kebab', 
    price: 243, 
    category: 'kebabs', 
    emoji: '🍢', 
    image: 'https://images.unsplash.com/photo-1599487488170-d33199eae26f?auto=format&fit=crop&w=600&q=80',
    description: 'Boneless chicken chunks marinated in yogurt and spices, grilled to smoky perfection in a tandoor.' 
  },
  'tandoori-chicken-half': { 
    name: 'Tandoori Chicken (Half)', 
    price: 243, 
    category: 'kebabs', 
    emoji: '🍗', 
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Classic bone-in chicken marinated in traditional red spices and roasted in a clay oven.' 
  },
  'tandoori-chicken-full': { 
    name: 'Tandoori Chicken (Full)', 
    price: 379, 
    category: 'kebabs', 
    emoji: '🍗', 
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Whole chicken roasted in the tandoor with smoky charcoal flavors and aromatic spices.' 
  },
  'chicken-reshmi-kebab': { 
    name: 'Chicken Reshmi Kebab', 
    price: 243, 
    category: 'kebabs', 
    emoji: '🍢', 
    image: 'https://images.unsplash.com/photo-1599487488170-d33199eae26f?auto=format&fit=crop&w=600&q=80',
    description: 'Extremely tender and melt-in-mouth chicken kebabs marinated in cream, cashews, and mild spices.' 
  },
  'chicken-garlic-kebab': { 
    name: 'Chicken Garlic Kebab', 
    price: 243, 
    category: 'kebabs', 
    emoji: '🧄', 
    image: 'https://images.unsplash.com/photo-1599487488170-d33199eae26f?auto=format&fit=crop&w=600&q=80',
    description: 'Juicy chicken pieces infused with rich garlic flavor, grilled over glowing embers.' 
  },
  'butter-chicken-boneless': { 
    name: 'Butter Chicken Boneless', 
    price: 246, 
    category: 'curries', 
    emoji: '🍲', 
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80',
    description: 'Tender tandoori chicken pieces simmered in a rich, buttery, and slightly sweet tomato gravy.' 
  },
  'mutton-rogan-josh': { 
    name: 'Mutton Rogan Josh', 
    price: 320, 
    category: 'curries', 
    emoji: '🥘', 
    image: 'https://images.unsplash.com/photo-1545247181-550b74f30d35?auto=format&fit=crop&w=600&q=80',
    description: 'Slow-cooked succulent mutton in an aromatic Kashmiri red chili and herb-infused gravy.' 
  },
  'paneer-butter-masala': { 
    name: 'Paneer Butter Masala', 
    price: 220, 
    category: 'curries', 
    emoji: '🧀', 
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80',
    description: 'Soft cottage cheese cubes cooked in a velvety, rich tomato and cashew-nut gravy.' 
  },
  'tandoori-roti': { 
    name: 'Tandoori Roti', 
    price: 40, 
    category: 'breads', 
    emoji: '🫓', 
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    description: 'Traditional whole wheat flatbread baked fresh inside a clay tandoor oven.' 
  },
  'butter-naan': { 
    name: 'Butter Naan', 
    price: 55, 
    category: 'breads', 
    emoji: '🫓', 
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    description: 'Soft leavened refined flour flatbread brushed generously with melted butter.' 
  },
  'rumalli-roti': { 
    name: 'Rumalli Roti', 
    price: 60, 
    category: 'breads', 
    emoji: '🫓', 
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    description: 'Thin, soft, handkerchief-like folded flatbread cooked on an inverted tawa.' 
  },
  'double-ka-meetha': { 
    name: 'Double Ka Meetha', 
    price: 173, 
    category: 'desserts', 
    emoji: '🍮', 
    image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    description: 'Hyderabadi royal bread pudding fried in pure ghee, soaked in rich saffron milk and nuts.' 
  },
  'khubani-ka-meetha': { 
    name: 'Khubani Ka Meetha', 
    price: 190, 
    category: 'desserts', 
    emoji: '🍑', 
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    description: 'Traditional Hyderabadi sweet made from dried apricots served with fresh cream.' 
  },
  'coke-500ml': { 
    name: 'Coke (500ml)', 
    price: 60, 
    category: 'desserts', 
    emoji: '🥤', 
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
    description: 'Chilled refreshing carbonated soft drink to complement your heavy meal.' 
  }
};

const PORT = process.env.PORT || 3000;
const ANDROID_CHANNEL_ID = 'new_messages_channel';

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

// ============================================================
// STARTUP CHECK & FIREBASE ADMIN SETUP
// ============================================================
console.log('ENV check:', {
    DB_HOST: !!process.env.DB_HOST,
    DB_USER: !!process.env.DB_USER,
    DB_PASS: !!process.env.DB_PASS,
    DB_NAME: !!process.env.DB_NAME,
    DB_PORT: !!process.env.DB_PORT,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    SECRET_FILE: fs.existsSync('/etc/secrets/firebase.json')
});

let messaging = null;

function loadServiceAccount() {
    let sa;
    const secretPath = '/etc/secrets/firebase.json';

    if (fs.existsSync(secretPath)) {
        console.log('Firebase: secret file vapraay che');
        sa = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    } else {
        let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!raw) {
            throw new Error('Secret file ane FIREBASE_SERVICE_ACCOUNT banne nathi');
        }
        console.log('Firebase: env variable vapraay che');
        raw = raw.trim();

        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            raw = raw.slice(1, -1);
        }
        if (!raw.startsWith('{')) {
            raw = Buffer.from(raw, 'base64').toString('utf8');
        }
        sa = JSON.parse(raw);
    }

    if (!sa.private_key || !sa.client_email || !sa.project_id) {
        throw new Error('JSON ma private_key / client_email / project_id nathi');
    }

    sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');

    if (!sa.private_key.includes('BEGIN PRIVATE KEY')) {
        throw new Error('private_key format khotu che');
    }
    return sa;
}

try {
    const serviceAccount = loadServiceAccount();
    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount)
        });
    }
    messaging = getMessaging();
    console.log('Firebase Admin initialized successfully! 🔥');
} catch (error) {
    console.error('Firebase initialization error:', error.message);
}

// ============================================================
// MYSQL POOL & TABLE CREATION
// ============================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'defaultdb',
    port: Number(process.env.DB_PORT) || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true
});

pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error('Database/Table error:', err.code, err.message || '');
        return;
    }
    console.log('Connected to MySQL & Messages table ready!');
});

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
app.use(cors());
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

// ============================================================
// API ROUTES
// ============================================================
app.get('/api/health', (req, res) => res.json({ 
    status: 'ok', 
    razorpayKeys: KEYS_OK, 
    firebase: !!messaging,
    ordersApi: ORDERS_API_URL || 'not set (local only)' 
}));

app.get('/api/menu', (req, res) => res.json({ success: true, menu: MENU }));

// ============================================================
// ALL ORDERS API (Badha orders ek sathe get karva mate)
// ============================================================
app.get('/api/orders', (req, res) => {
  res.json({ 
    success: true, 
    orders: Object.values(db).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) 
  });
});

// Messages MySQL & FCM Push Notification Routes
app.get('/api/messages', (req, res) => {
    pool.query('SELECT * FROM messages ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: results });
    });
});

app.get('/api/messages/:id', (req, res) => {
    pool.query('SELECT * FROM messages WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/messages', async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({
            success: false,
            message: 'name, email, subject and message are required'
        });
    }

    pool.query(
        'INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
        [name, email, subject, message],
        async (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const insertedId = results.insertId;

            if (!messaging) {
                return res.status(201).json({
                    success: true,
                    message: 'Record created, but notification skipped (Firebase offline)',
                    insertedId,
                    notificationSent: false
                });
            }

            try {
                await messaging.send({
                    topic: 'new_messages',
                    notification: {
                        title: 'New Message Received',
                        body: `${name}: ${subject}`
                    },
                    android: {
                        priority: 'high',
                        ttl: 3600 * 1000,
                        notification: {
                            channelId: ANDROID_CHANNEL_ID,
                            priority: 'high',
                            defaultSound: true,
                            defaultVibrateTimings: true,
                            visibility: 'public',
                            notificationCount: 1
                        }
                    },
                    data: {
                        type: 'new_message',
                        messageId: String(insertedId),
                        name: String(name),
                        email: String(email),
                        subject: String(subject)
                    }
                });

                return res.status(201).json({
                    success: true,
                    message: 'Thank you! Your message has been sent successfully. I will get back to you soon',
                    insertedId,
                    notificationSent: true
                });
            } catch (fcmError) {
                console.error('FCM error:', fcmError.message);
                return res.status(201).json({
                    success: true,
                    message: 'Record created but notification failed',
                    insertedId,
                    notificationSent: false,
                    notificationError: fcmError.message
                });
            }
        }
    );
});

app.put('/api/messages/:id', (req, res) => {
    const { name, email, subject, message } = req.body;

    pool.query(
        'UPDATE messages SET name = ?, email = ?, subject = ?, message = ? WHERE id = ?',
        [name, email, subject, message, req.params.id],
        (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Record not found' });
            }
            res.json({ success: true, message: 'Record updated successfully' });
        }
    );
});

app.delete('/api/messages/:id', (req, res) => {
    pool.query('DELETE FROM messages WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, message: 'Record deleted successfully' });
    });
});

// Razorpay Payment Routes
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  PARADISE running  ->  http://localhost:${PORT}`);
  console.log('  Razorpay keys     : ' + (KEYS_OK ? 'OK (' + (KEY_ID.startsWith('rzp_live') ? 'LIVE' : 'TEST') + ' mode)' : 'NOT SET - edit .env'));
  console.log('  Orders API        : ' + (ORDERS_API_URL || 'not set - orders saved in data/orders.json only'));
  console.log('  Firebase Messaging: ' + (messaging ? 'CONNECTED' : 'OFFLINE') + '\n');
  retryPending();
});
