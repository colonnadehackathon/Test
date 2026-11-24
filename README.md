# Cosmic Stocks

A deep-space themed stock observatory. **Python (Flask)** backend, **vanilla JavaScript + Chart.js** frontend.

## Features

- **Sign-in required.** First-time visitors sign up with a username, password and a security question.
  Passwords can be reset by answering that question.
- **Observatory (dashboard).** Enter a company name or ticker (with live suggestions). Each row shows the
  company name, ticker, exchange, current price, daily change and a 30-day price chart.
- **Manage the list.** Add companies, remove them (the row spirals into a vortex), and reorder them by dragging
  the ⋮⋮ handle or using the ▲ / ▼ buttons. The list is saved per user.
- **Details page.** Click a row to fall through a black hole into the company's own galaxy: current price, key
  stats, a full 30-day chart, a daily price log, and recent news.

- **Effects toggle.** Animations follow the operating system's "reduce motion" setting (often switched off on
  Windows Server). The ✦ Effects button in the top bar overrides it and is remembered per browser.

Market data and news come from Yahoo Finance's public endpoints (no API key). Prices may be delayed.

## Running it

Requires Python 3.10+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000.

Environment variables (optional): `PORT` (default 5000), `COSMOS_SECRET_KEY` (session signing key; otherwise one
is generated in `backend/data/secret.key`), `COSMOS_DATA_DIR` (where JSON data files live), `FLASK_DEBUG=1`.

## Project layout

```
backend/
  app.py          Flask app: page routes + JSON API
  auth.py         Sign up / sign in / password reset (users.json)
  stocks.py       Yahoo Finance client (search, quote + 30-day history, news) with a small cache
  storage.py      Thread-safe JSON file storage
  data/           Created at runtime: users.json, watchlists.json, secret.key (git-ignored)
frontend/
  login.html, index.html, details.html
  static/css/space.css
  static/js/common.js     API helper, starfield, black hole transition
  static/js/login.js      Sign in / sign up / reset
  static/js/dashboard.js  Watchlist, add/remove/reorder, vortex
  static/js/details.js    Details page
  static/js/charts.js     Chart.js styling
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{username, password, question, answer}` |
| POST | `/api/auth/login` | `{username, password}` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/question` | `{username}` → security question |
| POST | `/api/auth/reset` | `{username, answer, password}` |
| GET | `/api/watchlist` | Ordered symbols |
| POST | `/api/watchlist` | `{query}` company name or ticker |
| DELETE | `/api/watchlist/<symbol>` | Remove |
| PUT | `/api/watchlist/order` | `{symbols: [...]}` |
| GET | `/api/search?q=` | Company suggestions |
| GET | `/api/stock/<symbol>` | Price, name, 30-day history |
| GET | `/api/stock/<symbol>/news` | Recent news |

## Security note

As specified, passwords and security answers are stored in `backend/data/users.json` **Base64-encoded**.
Base64 is an encoding, not encryption: anyone who can read that file can recover every password. Before real
use, replace `encode_secret` / `check_secret` in `backend/auth.py` with a proper password hash
(e.g. `werkzeug.security.generate_password_hash` / `check_password_hash`), and add login rate limiting.
