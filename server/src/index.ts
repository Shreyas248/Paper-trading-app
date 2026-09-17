import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 4000);
const dbPath = process.env.DATABASE_PATH || './orbit.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    created_at TEXT NOT NULL
  )
`);
const orderColumns = db.prepare('PRAGMA table_info(orders)').all() as { name: string }[];
if (!orderColumns.some((column) => column.name === 'user_id')) db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id)');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());

type AuthenticatedRequest = Request & { userId?: number; user?: { id: number; name: string; email: string } };
const authCookie = 'orbit_session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const passwordHash = (password: string, salt: string) => scryptSync(password, salt, 64).toString('hex');
const publicUser = (user: { id: number; name: string; email: string }) => ({ id: user.id, name: user.name, email: user.email });
const readCookie = (request: Request, name: string) => request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const setSession = (response: Response, userId: number) => {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)').run(userId, hashToken(token), expires.toISOString(), now.toISOString());
  response.setHeader('Set-Cookie', `${authCookie}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
};
const requireAuth = (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
  const token = readCookie(request, authCookie);
  if (!token) return response.status(401).json({ error: 'Authentication required' });
  const session = db.prepare(`SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), new Date().toISOString()) as { id: number; name: string; email: string } | undefined;
  if (!session) return response.status(401).json({ error: 'Session expired' });
  request.userId = session.id;
  request.user = session;
  next();
};

const bases: Record<string, number> = { NVDA: 141.82, AAPL: 227.91, MSFT: 509.03, TSLA: 343.21, AMZN: 232.16, BTC: 104182.3 };
const names: Record<string, string> = { NVDA: 'NVIDIA Corp.', AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', TSLA: 'Tesla Inc.', AMZN: 'Amazon.com Inc.', BTC: 'Bitcoin / USD' };
const sectors: Record<string, string> = { NVDA: 'Semiconductors', AAPL: 'Consumer Tech', MSFT: 'Software', TSLA: 'Automotive', AMZN: 'Consumer', BTC: 'Digital assets' };
const tick = () => Math.floor(Date.now() / 3500);
const priceFor = (symbol: string) => {
  const base = bases[symbol] ?? 100;
  const wave = Math.sin(tick() * 0.73 + symbol.length) * base * 0.003;
  const drift = Math.sin(tick() * 0.17 + symbol.charCodeAt(0)) * base * 0.0015;
  return Number((base + wave + drift).toFixed(symbol === 'BTC' ? 2 : 2));
};
const quote = (symbol: string) => {
  const price = priceFor(symbol);
  const previous = bases[symbol] ?? price;
  const change = Number((price - previous).toFixed(2));
  return { symbol, name: names[symbol], sector: sectors[symbol], price, change, changePct: Number(((change / previous) * 100).toFixed(2)), volume: symbol === 'BTC' ? '28.4B' : `${(12.4 + symbol.length * 1.7).toFixed(1)}M` };
};

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'orbit-trader' }));
const signupSchema = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().email().max(160), password: z.string().min(8).max(128) });
const loginSchema = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(128) });
app.post('/api/auth/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' });
  const input = parsed.data;
  const salt = randomBytes(16).toString('hex');
  try {
    const result = db.prepare('INSERT INTO users (name, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)').run(input.name, input.email.toLowerCase(), passwordHash(input.password, salt), salt, new Date().toISOString());
    setSession(res, Number(result.lastInsertRowid));
    res.status(201).json({ user: { name: input.name, email: input.email.toLowerCase() } });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return res.status(409).json({ error: 'An account with that email already exists.' });
    res.status(500).json({ error: 'Unable to create account.' });
  }
});
app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = db.prepare('SELECT id, name, email, password_hash, password_salt FROM users WHERE email = ? COLLATE NOCASE').get(parsed.data.email.toLowerCase()) as { id: number; name: string; email: string; password_hash: string; password_salt: string } | undefined;
  const expectedHash = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(0);
  const providedHash = user ? Buffer.from(passwordHash(parsed.data.password, user.password_salt), 'hex') : Buffer.alloc(0);
  if (!user || expectedHash.length !== providedHash.length || !timingSafeEqual(expectedHash, providedHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});
app.get('/api/auth/me', (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const token = readCookie(req, authCookie);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const user = db.prepare(`SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), new Date().toISOString()) as { id: number; name: string; email: string } | undefined;
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  authenticated.user = user;
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/logout', (req, res) => {
  const token = readCookie(req, authCookie);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  res.setHeader('Set-Cookie', `${authCookie}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.status(204).send();
});
app.get('/api/market', (_req, res) => res.json(Object.keys(bases).map(quote)));
app.get('/api/market/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!bases[symbol]) return res.status(404).json({ error: 'Symbol not found' });
  res.json(quote(symbol));
});

app.get('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.userId);
  res.json(orders);
});

app.get('/api/positions', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db.prepare(`SELECT symbol, SUM(CASE WHEN side = 'BUY' THEN quantity ELSE -quantity END) as quantity, SUM(CASE WHEN side = 'BUY' THEN quantity * price ELSE -quantity * price END) as cost FROM orders WHERE user_id = ? GROUP BY symbol`).all(req.userId) as { symbol: string; quantity: number; cost: number }[];
  const positions = rows.filter((row) => row.quantity !== 0).map((row) => {
    const current = priceFor(row.symbol);
    const average = row.cost / row.quantity;
    return { ...row, average: Number(average.toFixed(2)), current, marketValue: Number((row.quantity * current).toFixed(2)), pnl: Number(((current - average) * row.quantity).toFixed(2)), pnlPct: Number((((current - average) / average) * 100).toFixed(2)) };
  });
  res.json(positions);
});

const orderSchema = z.object({ symbol: z.string().min(1), side: z.enum(['BUY', 'SELL']), quantity: z.number().int().positive(), price: z.number().positive() });
app.post('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid order', details: parsed.error.flatten() });
  const input = parsed.data;
  const result = db.prepare('INSERT INTO orders (user_id, symbol, side, quantity, price, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.userId, input.symbol.toUpperCase(), input.side, input.quantity, input.price, new Date().toISOString());
  res.status(201).json({ id: result.lastInsertRowid, ...input, symbol: input.symbol.toUpperCase(), created_at: new Date().toISOString() });
});

app.post('/api/assistant', requireAuth, (req, res) => {
  const symbol = String(req.body.symbol || 'NVDA').toUpperCase();
  const selected = quote(bases[symbol] ? symbol : 'NVDA');
  const risk = Math.abs(selected.changePct) > 1.2 ? 'elevated' : 'contained';
  res.json({ message: `For ${selected.symbol}, momentum is ${selected.changePct >= 0 ? 'positive' : 'soft'} at ${selected.changePct}%. Volume is holding near ${selected.volume}, while the session bias remains ${risk}. A disciplined setup would wait for a reclaim above ${ (selected.price * 1.008).toFixed(2) } before adding risk, with an invalidation near ${ (selected.price * 0.982).toFixed(2) }.`, citations: ['Live quote stream', 'Momentum model v2.4'] });
});

app.listen(port, () => console.log(`Orbit Trader API listening on :${port}`));
