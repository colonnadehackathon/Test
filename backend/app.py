"""Cosmic Stocks - Flask backend serving the API and the static frontend."""
import os
import secrets
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory, session

import auth
import stocks
from storage import DATA_DIR, JsonStore

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA"]

watchlists = JsonStore("watchlists.json")


def _secret_key() -> str:
    if os.environ.get("COSMOS_SECRET_KEY"):
        return os.environ["COSMOS_SECRET_KEY"]
    path = DATA_DIR / "secret.key"
    if not path.exists():
        path.write_text(secrets.token_hex(32), encoding="ascii")
    return path.read_text(encoding="ascii").strip()


app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=_secret_key(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


# ---------------------------------------------------------------- helpers
def current_user():
    name = session.get("user")
    return name if name and auth.exists(name) else None


def api_login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify(error="Please sign in."), 401
        return fn(*args, **kwargs)
    return wrapper


def page_login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return redirect("/login")
        return fn(*args, **kwargs)
    return wrapper


def body():
    return request.get_json(silent=True) or {}


@app.errorhandler(auth.AuthError)
def _auth_error(err):
    return jsonify(error=err.message), err.status


@app.errorhandler(stocks.StockError)
def _stock_error(err):
    return jsonify(error=err.message), err.status


@app.before_request
def _require_json_for_writes():
    # Simple CSRF guard: cross-site HTML forms cannot send application/json.
    if request.path.startswith("/api/") and request.method in ("POST", "PUT", "DELETE"):
        if request.method != "DELETE" and not request.is_json:
            return jsonify(error="Expected JSON body."), 415


# ---------------------------------------------------------------- pages
@app.get("/")
@page_login_required
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/login")
def login_page():
    if current_user():
        return redirect("/")
    return send_from_directory(FRONTEND, "login.html")


@app.get("/stock/<symbol>")
@page_login_required
def details_page(symbol):
    return send_from_directory(FRONTEND, "details.html")


@app.get("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND / "static", filename)


# ---------------------------------------------------------------- auth API
@app.post("/api/auth/signup")
def api_signup():
    b = body()
    user = auth.signup(b.get("username"), b.get("password"), b.get("question"), b.get("answer"))
    session.clear()
    session["user"] = user
    return jsonify(user=user), 201


@app.post("/api/auth/login")
def api_login():
    b = body()
    user = auth.login(b.get("username"), b.get("password"))
    session.clear()
    session["user"] = user
    return jsonify(user=user)


@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/auth/me")
def api_me():
    return jsonify(user=current_user())


@app.post("/api/auth/question")
def api_question():
    return jsonify(question=auth.get_question(body().get("username")))


@app.post("/api/auth/reset")
def api_reset():
    b = body()
    user = auth.reset_password(b.get("username"), b.get("answer"), b.get("password"))
    return jsonify(user=user)


# ---------------------------------------------------------------- stocks API
def _user_list(data, user):
    key = user.lower()
    if key not in data:
        data[key] = list(DEFAULT_WATCHLIST)
    return data[key]


@app.get("/api/watchlist")
@api_login_required
def api_watchlist():
    user = current_user()
    return jsonify(symbols=watchlists.update(lambda d: list(_user_list(d, user))))


@app.post("/api/watchlist")
@api_login_required
def api_watchlist_add():
    user = current_user()
    symbol = stocks.resolve(body().get("query"))
    data = stocks.quote(symbol)  # validates the symbol has price data
    symbol = data["symbol"]

    def _add(d):
        lst = _user_list(d, user)
        if symbol in lst:
            raise auth.AuthError(f"{symbol} is already in your observatory.", 409)
        lst.append(symbol)

    watchlists.update(_add)
    return jsonify(stock=data), 201


@app.delete("/api/watchlist/<symbol>")
@api_login_required
def api_watchlist_remove(symbol):
    user = current_user()
    symbol = symbol.upper()

    def _remove(d):
        lst = _user_list(d, user)
        if symbol in lst:
            lst.remove(symbol)
        return list(lst)

    return jsonify(symbols=watchlists.update(_remove))


@app.put("/api/watchlist/order")
@api_login_required
def api_watchlist_order():
    user = current_user()
    wanted = [str(s).upper() for s in body().get("symbols", [])]

    def _order(d):
        lst = _user_list(d, user)
        if sorted(wanted) != sorted(lst):
            raise auth.AuthError("Order must contain exactly the current symbols.", 400)
        d[user.lower()] = wanted
        return wanted

    return jsonify(symbols=watchlists.update(_order))


@app.get("/api/search")
@api_login_required
def api_search():
    return jsonify(quotes=stocks.search(request.args.get("q", ""))["quotes"])


@app.get("/api/stock/<symbol>")
@api_login_required
def api_stock(symbol):
    return jsonify(stocks.quote(symbol))


@app.get("/api/stock/<symbol>/news")
@api_login_required
def api_news(symbol):
    name = request.args.get("name")
    return jsonify(news=stocks.news(symbol.upper(), name))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
