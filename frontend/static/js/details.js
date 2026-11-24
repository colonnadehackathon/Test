/* Details page: current price, 30-day history and company news. */
(function () {
  "use strict";
  const { api, el, fmtMoney, fmtNum, fmtChange, toast, enterBlackHole } = window.Cosmos;
  const stars = window.Cosmos.starfield();
  window.Cosmos.arrive(stars);

  const symbol = decodeURIComponent(location.pathname.split("/").pop() || "").toUpperCase();
  const $ = (id) => document.getElementById(id);

  document.getElementById("logout").addEventListener("click", window.Cosmos.logout);
  $("back-link").addEventListener("click", (e) => {
    e.preventDefault();
    enterBlackHole(innerWidth / 2, innerHeight / 2, "/", stars);
  });

  api("/api/auth/me").then((me) => ($("who").textContent = me.user || "")).catch(() => {});

  (async function load() {
    let stock;
    try {
      stock = await api(`/api/stock/${encodeURIComponent(symbol)}`);
    } catch (e) {
      $("d-name").textContent = "Signal lost";
      $("d-ex").textContent = e.message;
      $("d-news").replaceChildren();
      toast(e.message, true);
      return;
    }
    renderHead(stock);
    renderStats(stock);
    renderHistory(stock);
    window.CosmosCharts.priceChart($("d-chart"), stock.history, { currency: stock.currency });
    loadNews(stock);
  })();

  function renderHead(s) {
    document.title = `${s.symbol} · ${s.name} · Cosmic Stocks`;
    $("d-symbol").textContent = s.symbol;
    $("d-name").textContent = s.name;
    $("d-ex").textContent = [s.exchange, s.currency].filter(Boolean).join(" · ");
    $("d-price").textContent = fmtMoney(s.price, s.currency);
    const chg = fmtChange(s.change, s.changePercent);
    $("d-chg").className = `big-chg ${chg.cls}`;
    $("d-chg").textContent = `${chg.text} today`;
  }

  function renderStats(s) {
    const closes = s.history.map((h) => h.close);
    const first = closes[0], last = closes[closes.length - 1];
    const periodChg = first ? ((last - first) / first) * 100 : null;
    const m = (v) => fmtMoney(v, s.currency);
    const stats = [
      ["Previous close", m(s.previousClose)],
      ["Day range", s.dayLow != null ? `${m(s.dayLow)} – ${m(s.dayHigh)}` : "—"],
      ["30-day high", m(closes.length ? Math.max(...s.history.map((h) => h.high ?? h.close)) : null)],
      ["30-day low", m(closes.length ? Math.min(...s.history.map((h) => h.low ?? h.close)) : null)],
      ["30-day change", periodChg == null ? "—" : `${periodChg >= 0 ? "+" : ""}${periodChg.toFixed(2)}%`, periodChg >= 0 ? "up" : "down"],
      ["Volume", fmtNum(s.volume)],
      ["52-week range", s.fiftyTwoWeekLow != null ? `${m(s.fiftyTwoWeekLow)} – ${m(s.fiftyTwoWeekHigh)}` : "—"],
    ];
    $("d-stats").replaceChildren(...stats.map(([k, v, cls], i) => {
      const card = el("div", { class: "stat panel" }, el("div", { class: "k", text: k }), el("div", { class: `v ${cls || ""}`, text: v }));
      card.style.animation = `row-arrive .6s ${0.3 + i * 0.06}s both`;
      return card;
    }));
  }

  function renderHistory(s) {
    const m = (v) => fmtMoney(v, s.currency);
    const rows = [...s.history].reverse().map((h, i, arr) => {
      const prev = arr[i + 1]?.close;
      const cls = prev == null ? "" : h.close >= prev ? "up" : "down";
      return el("tr", {},
        el("td", { text: h.date }), el("td", { text: m(h.open) }), el("td", { text: m(h.high) }),
        el("td", { text: m(h.low) }), el("td", { class: cls, text: m(h.close) }), el("td", { text: fmtNum(h.volume) }));
    });
    $("d-history").replaceChildren(...rows);
  }

  async function loadNews(s) {
    const box = $("d-news");
    try {
      const { news } = await api(`/api/stock/${encodeURIComponent(s.symbol)}/news?name=${encodeURIComponent(s.name)}`);
      if (!news.length) {
        box.replaceChildren(el("p", { class: "muted", text: "No transmissions received for this company right now." }));
        return;
      }
      box.replaceChildren(...news.map((n, i) => {
        const thumb = n.thumbnail
          ? el("img", { class: "thumb", src: n.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })
          : el("div", { class: "thumb", "aria-hidden": "true" });
        const when = n.time ? new Date(n.time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
        const item = el("a", { class: "news-item", href: n.link, target: "_blank", rel: "noopener noreferrer" },
          thumb,
          el("div", {}, el("div", { class: "t", text: n.title }), el("div", { class: "meta", text: [n.publisher, when].filter(Boolean).join(" · ") })));
        item.style.animationDelay = `${0.2 + i * 0.07}s`;
        return item;
      }));
    } catch (e) {
      box.replaceChildren(el("p", { class: "muted", text: `News unavailable: ${e.message}` }));
    }
  }
})();
