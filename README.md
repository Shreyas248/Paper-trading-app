# Orbit Trader

A full-stack paper trading workstation with simulated live market data, persisted orders, positions and an AI-style trading copilot.

## Run locally

Use Node 22 LTS for the local server because the SQLite driver is a native addon. Docker uses Node 22 in both images.

```bash
npm install
npm run dev
```

- Workstation: http://localhost:5173
- API: http://localhost:4000

The server stores paper orders in `orbit.db` by default. The market feed is simulated and intentionally contains no real broker connection.
Accounts use SQLite-backed sessions in an HttpOnly cookie. Passwords are salted and hashed with Node's built-in `scrypt`; private orders and positions are scoped to the signed-in user.

## Run with Docker

```bash
docker compose up --build
```

The SQLite database is stored in the `orbit_data` named volume. Set `VITE_API_URL` when hosting the client and API on different origins.

## Included API routes

- `GET /api/market`
- `GET /api/positions`
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/assistant`
- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
