import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CandlestickChart,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  DollarSign,
  LineChart,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Quote = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  volume: string;
};
type Position = {
  symbol: string;
  quantity: number;
  average: number;
  current: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
};
type Order = {
  id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  created_at: string;
};
type User = { id?: number; name: string; email: string };
const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const chartSeed = Array.from({ length: 34 }, (_, index) => ({
  time: `${9 + Math.floor(index / 4)}:${String((index % 4) * 15).padStart(2, "0")}`,
  value:
    138.2 +
    index * 0.16 +
    Math.sin(index / 2.5) * 1.1 +
    (index > 22 ? (index - 22) * 0.35 : 0),
}));

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState(["NVDA", "AAPL", "MSFT"]);
  const [watchlistPickerOpen, setWatchlistPickerOpen] = useState(false);
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(10);
  const [assistantInput, setAssistantInput] = useState(
    "What is the risk profile for this setup?",
  );
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: "assistant",
      text: "Good morning. I am watching NVDA with you. Ask me about setup quality, sizing, catalysts, or portfolio risk.",
    },
  ]);
  const [toast, setToast] = useState("");
  const selected = quotes.find((item) => item.symbol === selectedSymbol) || {
    symbol: selectedSymbol,
    name: "Loading quote...",
    sector: "",
    price: 141.82,
    change: 0,
    changePct: 0,
    volume: "--",
  };
  const watchlistQuotes = quotes.filter((item) => watchlistSymbols.includes(item.symbol));
  const availableQuotes = quotes.filter((item) => !watchlistSymbols.includes(item.symbol) && `${item.symbol} ${item.name}`.toLowerCase().includes(watchlistSearch.toLowerCase()));

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: "include" })
      .then(async (response) => (response.ok ? (await response.json()).user : null))
      .then((currentUser) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const load = async () => {
    const [market, positionData, orderData] = await Promise.all([
      fetch(`${API}/api/market`, { credentials: "include" }),
      fetch(`${API}/api/positions`, { credentials: "include" }),
      fetch(`${API}/api/orders`, { credentials: "include" }),
    ]);
    if ([positionData, orderData].some((response) => response.status === 401)) {
      setUser(null);
      return;
    }
    setQuotes(await market.json());
    setPositions(await positionData.json());
    setOrders(await orderData.json());
  };
  useEffect(() => {
    if (!user) return;
    load();
    const timer = window.setInterval(load, 3500);
    return () => window.clearInterval(timer);
  }, [user]);
  const totalPnl = positions.reduce((sum, item) => sum + item.pnl, 0);
  const portfolioValue = positions.reduce(
    (sum, item) => sum + item.marketValue,
    0,
  );
  const chartData = useMemo(
    () =>
      chartSeed.map((point, index) => ({
        ...point,
        value:
          selected.symbol === "NVDA"
            ? point.value
            : selected.price *
              (0.97 + (index / 33) * 0.04 + Math.sin(index) * 0.002),
      })),
    [selected.symbol, selected.price],
  );

  const submitOrder = async () => {
    const response = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        symbol: selected.symbol,
        side,
        quantity,
        price: selected.price,
      }),
    });
    if (!response.ok) {
      setToast("Sign in again to place a paper trade.");
      return;
    }
    setToast(
      `${side === "BUY" ? "Bought" : "Sold"} ${quantity} ${selected.symbol} at $${selected.price.toFixed(2)}`,
    );
    await load();
    window.setTimeout(() => setToast(""), 3000);
  };
  const askAssistant = async () => {
    if (!assistantInput.trim()) return;
    const prompt = assistantInput;
    setAssistantInput("");
    setAssistantMessages((items) => [...items, { role: "user", text: prompt }]);
    const response = await fetch(`${API}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ symbol: selected.symbol, prompt }),
    });
    const data = await response.json();
    setAssistantMessages((items) => [
      ...items,
      { role: "assistant", text: data.message },
    ]);
  };
  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const endpoint = authMode === "login" ? "login" : "signup";
    const response = await fetch(`${API}/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...(authMode === "signup" ? { name: authName } : {}),
        email: authEmail,
        password: authPassword,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setAuthError(data.error || "Unable to authenticate.");
    } else {
      setUser(data.user);
      setAuthPassword("");
    }
    setAuthBusy(false);
  };
  const logout = async () => {
    await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setQuotes([]);
    setPositions([]);
    setOrders([]);
  };
  const money = (value: number) =>
    `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!authChecked) return <div className="auth-shell"><div className="auth-loading">Loading secure workspace...</div></div>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} name={authName} setName={setAuthName} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} error={authError} busy={authBusy} onSubmit={submitAuth} />;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <CandlestickChart size={18} />
          </div>
          <span>ORBIT</span>
          <small>TRADING WORKSTATION</small>
        </div>
        <div className="market-status">
          <span className="live-dot" />
          MARKET OPEN <span className="divider" /> NASDAQ{" "}
          <span className="muted">09:42:18 ET</span>
        </div>
        <div className="top-actions">
          <div className="profile-menu-wrap">
            <button className="avatar" title="Open account menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</button>
            {profileOpen && <div className="profile-menu"><strong>{user.name}</strong><span>{user.email}</span><button className="profile-logout" onClick={logout}>Sign out</button></div>}
          </div>
        </div>
      </header>
      <main className="workspace">
        <aside className="watch-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">LIVE UNIVERSE</span>
              <h2>Watchlist</h2>
            </div>
            <button className="icon-button" title="Add to watchlist" onClick={() => setWatchlistPickerOpen((open) => !open)}>
              <Plus size={17} />
            </button>
          </div>
          {watchlistPickerOpen && <div className="watchlist-picker"><div className="search-box"><Search size={15} /><input autoFocus value={watchlistSearch} onChange={(event) => setWatchlistSearch(event.target.value)} placeholder="Find a symbol" /></div>{availableQuotes.length ? availableQuotes.map((item) => <button className="picker-row" key={item.symbol} onClick={() => { setWatchlistSymbols((symbols) => [...symbols, item.symbol]); setSelectedSymbol(item.symbol); setWatchlistPickerOpen(false); setWatchlistSearch(""); }}><strong>{item.symbol}</strong><span>{item.name}</span><Plus size={14} /></button>) : <p className="picker-empty">No symbols available.</p>}</div>}
          <div className="search-box">
            <Search size={15} />
            <input placeholder="Search symbol" />
          </div>
          <div className="watch-list">
            {watchlistQuotes.map((item) => (
              <button
                className={`watch-row ${item.symbol === selected.symbol ? "active" : ""}`}
                key={item.symbol}
                onClick={() => setSelectedSymbol(item.symbol)}
              >
                <div>
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </div>
                <div className="watch-price">
                  <strong>${item.price.toFixed(2)}</strong>
                  <span className={item.change >= 0 ? "positive" : "negative"}>
                    {item.change >= 0 ? "+" : ""}
                    {item.changePct}%
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="watch-footer">
            <ShieldCheck size={15} />
            Paper trading mode <span className="live-dot" />
          </div>
        </aside>
        <section className="main-column">
          <div className="asset-header">
            <div className="asset-title">
              <div className="ticker-icon">{selected.symbol.slice(0, 1)}</div>
              <div>
                <div className="asset-name">
                  <h1>{selected.symbol}</h1>
                  <span className="exchange-pill">NASDAQ</span>
                  <span className="caret">
                    <ChevronDown size={14} />
                  </span>
                </div>
                <p>
                  {selected.name} <span>· {selected.sector}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="quote-strip">
            <div>
              <span className="eyebrow">LAST PRICE</span>
              <strong className="big-price">
                ${selected.price.toFixed(2)}
              </strong>
            </div>
            <div className={selected.change >= 0 ? "positive" : "negative"}>
              <span className="eyebrow">TODAY</span>
              <strong>
                {selected.change >= 0 ? "+" : ""}
                {selected.change.toFixed(2)} ({selected.changePct}%)
              </strong>
            </div>
            <div>
              <span className="eyebrow">VOLUME</span>
              <strong>{selected.volume}</strong>
            </div>
            <div>
              <span className="eyebrow">SESSION HIGH</span>
              <strong>${(selected.price * 1.018).toFixed(2)}</strong>
            </div>
            <div>
              <span className="eyebrow">SESSION LOW</span>
              <strong>${(selected.price * 0.986).toFixed(2)}</strong>
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-toolbar">
              <div className="time-tabs">
                <button>1D</button>
                <button>1W</button>
                <button className="selected">1M</button>
                <button>3M</button>
                <button>1Y</button>
              </div>
              <div className="chart-tools">
                <span>
                  <Activity size={14} /> Streaming
                </span>
                <button className="icon-button">
                  <LineChart size={16} />
                </button>
                <button className="icon-button">
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#c6f36b"
                        stopOpacity={0.28}
                      />
                      <stop offset="100%" stopColor="#c6f36b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#27312e" />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6e7d78", fontSize: 11 }}
                    interval={6}
                  />
                  <YAxis
                    orientation="right"
                    domain={["dataMin - 1", "dataMax + 1"]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6e7d78", fontSize: 11 }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#151d1c",
                      border: "1px solid #33413d",
                      borderRadius: 6,
                      color: "#f2f5ed",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#c6f36b"
                    strokeWidth={2}
                    fill="url(#chartFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-caption">
              <span>
                <span className="chart-dot" /> VWAP{" "}
                <b>${(selected.price * 0.993).toFixed(2)}</b>
              </span>
              <span>
                Data delayed 0.0s <RefreshCw size={12} />
              </span>
            </div>
          </div>
          <div className="lower-grid">
            <section className="table-section">
              <div className="section-header">
                <div>
                  <span className="eyebrow">YOUR ACCOUNT</span>
                  <h2>Open positions</h2>
                </div>
                <button className="text-button" onClick={() => setShowAllPositions((open) => !open)}>
                  {showAllPositions ? "Show less" : "View all"} <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="position-table">
                <div className="table-head">
                  <span>SYMBOL</span>
                  <span>QTY</span>
                  <span>AVG COST</span>
                  <span>MARKET VALUE</span>
                  <span>P&L</span>
                </div>
                {positions.length ? (
                  positions.slice(0, showAllPositions ? undefined : 2).map((position) => (
                    <div className="table-row" key={position.symbol}>
                      <strong>{position.symbol}</strong>
                      <span>{position.quantity}</span>
                      <span>${position.average.toFixed(2)}</span>
                      <span>${position.marketValue.toLocaleString()}</span>
                      <span
                        className={position.pnl >= 0 ? "positive" : "negative"}
                      >
                        {money(position.pnl)} ({position.pnlPct}%)
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    Place your first paper trade to see it here.
                  </div>
                )}
              </div>
            </section>
            <section className="activity-section">
              <div className="section-header">
                <div>
                  <span className="eyebrow">EXECUTION LOG</span>
                  <h2>Recent activity</h2>
                </div>
                <Clock3 size={16} className="muted" />
              </div>
              {orders.slice(0, 3).map((order) => (
                <div className="activity-row" key={order.id}>
                  <span
                    className={`activity-icon ${order.side === "BUY" ? "buy" : "sell"}`}
                  >
                    {order.side === "BUY" ? (
                      <ArrowDownRight size={14} />
                    ) : (
                      <ArrowUpRight size={14} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {order.side} {order.symbol}
                    </strong>
                    <span>
                      {order.quantity} shares at ${order.price.toFixed(2)}
                    </span>
                  </div>
                  <time>
                    {new Date(order.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </section>
          </div>
        </section>
        <aside className="right-panel">
          <section className="order-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PAPER EXECUTION</span>
                <h2>Order ticket</h2>
              </div>
              <span className="status-badge">SIM</span>
            </div>
            <div className="order-toggle">
              <button
                className={side === "BUY" ? "buy-active" : ""}
                onClick={() => setSide("BUY")}
              >
                Buy
              </button>
              <button
                className={side === "SELL" ? "sell-active" : ""}
                onClick={() => setSide("SELL")}
              >
                Sell
              </button>
            </div>
            <label>
              Symbol
              <input value={selected.symbol} readOnly />
            </label>
            <label>
              Quantity
              <div className="number-input">
                <input
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  min="1"
                />
                <span>shares</span>
              </div>
            </label>
            <label>
              Order type
              <div className="select-input">
                Market <ChevronDown size={15} />
              </div>
            </label>
            <div className="estimate">
              <span>Estimated cost</span>
              <strong>{money(selected.price * quantity)}</strong>
            </div>
            <button
              className={`submit-order ${side.toLowerCase()}`}
              onClick={submitOrder}
            >
              <Play size={15} fill="currentColor" /> Simulate{" "}
              {side === "BUY" ? "buy" : "sell"}
            </button>
            <p className="disclaimer">
              <ShieldCheck size={13} /> No real money. Orders are stored
              locally.
            </p>
          </section>
          <section className="account-card">
            <div className="section-header">
              <div>
                <span className="eyebrow">PAPER ACCOUNT</span>
                <h2>Performance</h2>
              </div>
              <button className="icon-button">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <div className="account-value">
              $
              {(25000 + portfolioValue).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
            <div className={`account-change ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
              <TrendingUp size={14} /> {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}{" "}
              <span>all time</span>
            </div>
            <div className="mini-metrics">
              <div>
                <span>Buying power</span>
                <strong>$25,000.00</strong>
              </div>
              <div>
                <span>Win rate</span>
                <strong>--</strong>
              </div>
            </div>
          </section>
          <section className="assistant-card">
            <div className="assistant-heading">
              <div className="bot-mark">
                <Sparkles size={16} />
              </div>
              <div>
                <h2>Orbit AI</h2>
                <span>Trading copilot · online</span>
              </div>
              <button className="icon-button">
                <X size={14} />
              </button>
            </div>
            <div className="assistant-feed">
              {assistantMessages.slice(-4).map((message, index) => (
                <div key={index} className={`message ${message.role}`}>
                  {message.role === "assistant" && <Bot size={13} />}
                  {message.text}
                </div>
              ))}
              <div className="suggestions">
                <button
                  onClick={() =>
                    setAssistantInput("Give me a clean entry and invalidation.")
                  }
                >
                  Entry idea
                </button>
                <button
                  onClick={() =>
                    setAssistantInput("How should I size this trade?")
                  }
                >
                  Sizing
                </button>
              </div>
            </div>
            <div className="assistant-input">
              <input
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && askAssistant()}
                placeholder="Ask Orbit anything..."
              />
              <button onClick={askAssistant}>
                <Send size={15} />
              </button>
            </div>
          </section>
        </aside>
      </main>
      {toast && (
        <div className="toast">
          <CircleHelp size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
type AuthScreenProps = {
  mode: "login" | "signup";
  setMode: (mode: "login" | "signup") => void;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string;
  busy: boolean;
  onSubmit: (event: React.FormEvent) => void;
};
function AuthScreen({ mode, setMode, name, setName, email, setEmail, password, setPassword, error, busy, onSubmit }: AuthScreenProps) {
  const signup = mode === "signup";
  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="auth-grid" />
        <div className="auth-brand"><div className="brand-mark"><CandlestickChart size={18} /></div><span>ORBIT</span></div>
        <div className="auth-hero-copy"><span className="eyebrow">PRIVATE MARKET INTELLIGENCE</span><h1>Trade with a clearer view.</h1><p>A focused paper-trading workspace for deliberate decisions, live context, and better habits.</p></div>
        <div className="auth-quote"><span className="live-dot" /> Encrypted session · Paper trading only</div>
      </div>
      <div className="auth-panel">
        <div className="auth-panel-top"><span className="eyebrow">WELCOME TO ORBIT</span><div className="auth-mode"><button className={!signup ? "active" : ""} onClick={() => { setMode("login"); }} type="button">Sign in</button><button className={signup ? "active" : ""} onClick={() => { setMode("signup"); }} type="button">Create account</button></div></div>
        <div className="auth-form-heading"><h2>{signup ? "Create your workspace" : "Welcome back"}</h2><p>{signup ? "Start building your paper-trading process." : "Sign in to access your private trading desk."}</p></div>
        <form className="auth-form" onSubmit={onSubmit}>
          {signup && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Alex Morgan" required /></label>}
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 8 characters" : "Your password"} minLength={signup ? 8 : 1} required /></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Securing session..." : signup ? "Create secure account" : "Sign in to Orbit"}<ArrowUpRight size={15} /></button>
        </form>
        <p className="auth-footnote"><ShieldCheck size={14} /> Your password is hashed and never stored in plain text.</p>
      </div>
    </div>
  );
}
function BellIcon() {
  return <Activity size={15} />;
}
export default App;
