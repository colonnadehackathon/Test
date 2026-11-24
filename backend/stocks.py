"""Stock data from Yahoo Finance public endpoints (no API key needed)."""
import re
import time
from datetime import datetime, timedelta, timezone

import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (CosmicStocks demo app)"}
CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"

_session = requests.Session()
_session.headers.update(HEADERS)
_cache: dict = {}


class StockError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    now = time.time()
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = fn()
    _cache[key] = (now, value)
    return value


def _get(url, params=None):
    try:
        resp = _session.get(url, params=params, timeout=10)
    except requests.RequestException as exc:
        raise StockError(f"Market data service unreachable: {exc.__class__.__name__}")
    if resp.status_code == 404:
        raise StockError("Unknown symbol.", 404)
    if not resp.ok:
        raise StockError(f"Market data service returned HTTP {resp.status_code}.")
    return resp.json()


def search(query: str, news_count: int = 0) -> dict:
    query = (query or "").strip()
    if not query:
        return {"quotes": [], "news": []}

    def _fetch():
        data = _get(SEARCH_URL, {"q": query, "quotesCount": 8, "newsCount": news_count})
        quotes = [
            {
                "symbol": q.get("symbol"),
                "name": q.get("longname") or q.get("shortname") or q.get("symbol"),
                "exchange": q.get("exchDisp") or q.get("exchange"),
                "type": q.get("quoteType"),
            }
            for q in data.get("quotes", [])
            if q.get("symbol") and q.get("quoteType") in ("EQUITY", "ETF", "INDEX", "MUTUALFUND")
        ]
        news = [
            {
                "title": n.get("title"),
                "publisher": n.get("publisher"),
                "link": n.get("link"),
                "time": n.get("providerPublishTime"),
                "thumbnail": _thumb(n),
            }
            for n in data.get("news", [])
            if n.get("title") and str(n.get("link", "")).startswith(("http://", "https://"))
        ]
        return {"quotes": quotes, "news": news}

    return _cached(("search", query.lower(), news_count), 300, _fetch)


def _thumb(item):
    res = (item.get("thumbnail") or {}).get("resolutions") or []
    if not res:
        return None
    best = min(res, key=lambda r: abs((r.get("width") or 0) - 300))
    url = best.get("url") or ""
    return url if url.startswith("https://") else None


def resolve(query: str) -> str:
    """Turn a company name or ticker into a ticker symbol."""
    query = (query or "").strip()
    if not query:
        raise StockError("Please enter a company name or ticker.", 400)
    quotes = search(query)["quotes"]
    if not quotes:
        raise StockError(f"No company found for '{query}'.", 404)
    exact = next((q for q in quotes if q["symbol"].upper() == query.upper()), None)
    equities = [q for q in quotes if q["type"] == "EQUITY"]
    # "Siemens" should pick "Siemens Aktiengesellschaft", not "Siemens Energy AG".
    named = next((q for q in equities if _core_name(q["name"]) == _core_name(query)), None)
    return (exact or named or (equities and equities[0]) or quotes[0])["symbol"]


_SUFFIXES = {
    "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "ag",
    "aktiengesellschaft", "se", "sa", "nv", "n.v", "s.a", "spa", "s.p.a", "ab", "asa", "oyj", "group",
    "holding", "holdings", "the", "class", "a", "b", "kgaa", "gmbh", "lp", "llc", "bv",
}


def _core_name(name: str) -> str:
    words = re.sub(r"[^\w.\s]", " ", (name or "").lower()).split()
    return " ".join(w for w in words if w.strip(".") not in _SUFFIXES and w not in _SUFFIXES)


def quote(symbol: str) -> dict:
    """Current price, company name and last 30 days of daily closes."""
    symbol = (symbol or "").strip().upper()

    def _fetch():
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=30)
        data = _get(
            CHART_URL.format(symbol=requests.utils.quote(symbol, safe="")),
            {"period1": int(start.timestamp()), "period2": int(now.timestamp()), "interval": "1d"},
        )
        result = ((data.get("chart") or {}).get("result") or [None])[0]
        if not result:
            raise StockError(f"No data for '{symbol}'.", 404)
        meta = result.get("meta", {})
        ind = (result.get("indicators") or {}).get("quote") or [{}]
        ind = ind[0]
        history = []
        for i, ts in enumerate(result.get("timestamp") or []):
            close = (ind.get("close") or [None] * (i + 1))[i]
            if close is None:
                continue
            history.append({
                "date": datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d"),
                "open": _at(ind, "open", i),
                "high": _at(ind, "high", i),
                "low": _at(ind, "low", i),
                "close": round(close, 4),
                "volume": _at(ind, "volume", i),
            })
        price = meta.get("regularMarketPrice") or (history[-1]["close"] if history else None)
        # Latest daily bar is the current session, so the one before it is the previous close.
        prev = history[-2]["close"] if len(history) >= 2 else (
            meta.get("previousClose") or meta.get("chartPreviousClose"))
        change = (price - prev) if price is not None and prev else None
        return {
            "symbol": meta.get("symbol", symbol),
            "name": meta.get("longName") or meta.get("shortName") or symbol,
            "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
            "currency": meta.get("currency"),
            "price": price,
            "previousClose": prev,
            "change": round(change, 4) if change is not None else None,
            "changePercent": round(change / prev * 100, 3) if change is not None and prev else None,
            "dayHigh": meta.get("regularMarketDayHigh"),
            "dayLow": meta.get("regularMarketDayLow"),
            "volume": meta.get("regularMarketVolume"),
            "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
            "marketTime": meta.get("regularMarketTime"),
            "history": history,
        }

    return _cached(("quote", symbol), 60, _fetch)


def _at(ind, key, i):
    values = ind.get(key) or []
    v = values[i] if i < len(values) else None
    return round(v, 4) if isinstance(v, float) else v


def news(symbol: str, name: str | None = None) -> list:
    items = search(symbol, news_count=12)["news"]
    if len(items) < 3 and name:
        seen = {n["link"] for n in items}
        items += [n for n in search(name, news_count=12)["news"] if n["link"] not in seen]
    # Headlines that name the company come first; the rest are related market news.
    terms = {symbol.split(".")[0].lower()}
    if name and _core_name(name):
        terms.add(_core_name(name).split()[0])
    mentions = lambda n: any(re.search(rf"\b{re.escape(t)}\b", n["title"].lower()) for t in terms)
    for n in items:
        n["direct"] = mentions(n)
    return sorted(items, key=lambda n: not n["direct"])[:12]
