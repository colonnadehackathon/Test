/* Observatory: watchlist with mini charts, add / remove (vortex) / reorder. */
(function () {
  "use strict";
  const { api, el, fmtMoney, fmtChange, toast, enterBlackHole } = window.Cosmos;
  const stars = window.Cosmos.starfield();
  window.Cosmos.arrive(stars);

  const list = document.getElementById("stock-list");
  const charts = new Map();
  let symbols = [];

  /* ---------------- bootstrap ---------------- */
  (async function init() {
    document.getElementById("logout").addEventListener("click", window.Cosmos.logout);
    try {
      const me = await api("/api/auth/me");
      document.getElementById("who").textContent = me.user || "";
      ({ symbols } = await api("/api/watchlist"));
      render();
    } catch (e) {
      toast(e.message, true);
    }
  })();

  function render() {
    list.replaceChildren();
    if (!symbols.length) return renderEmpty();
    symbols.forEach((s, i) => list.append(makeRow(s, i)));
    symbols.forEach(loadRow);
    refreshMoveButtons();
  }

  function renderEmpty() {
    if (list.querySelector(".stock-row")) return;
    list.replaceChildren(el("div", { class: "empty panel" },
      el("div", { class: "bh-mini", "aria-hidden": "true" }),
      el("p", { text: "Your observatory is empty. Add a company above to bring it into orbit." })));
  }

  /* ---------------- rows ---------------- */
  function makeRow(symbol, index = 0) {
    const row = el("article", {
      class: "stock-row panel", draggable: "true", tabindex: "0",
      "data-symbol": symbol, "aria-label": `${symbol} — open details`,
    });
    row.style.animationDelay = `${Math.min(index, 8) * 70}ms`;
    row.append(
      el("span", { class: "drag-handle", title: "Drag to reorder", "aria-hidden": "true", text: "⋮⋮" }),
      el("div", { class: "row-loading" }, el("span", { class: "orbit-loader" }), `Scanning ${symbol}…`),
      actions(symbol),
    );
    row.addEventListener("click", (e) => {
      if (e.target.closest("button, .drag-handle")) return;
      travel(row, e.clientX, e.clientY);
    });
    row.addEventListener("keydown", (e) => {
      if (e.target !== row) return;
      if (e.key === "Enter") {
        const r = row.getBoundingClientRect();
        travel(row, r.left + r.width / 2, r.top + r.height / 2);
      }
    });
    wireDrag(row);
    return row;
  }

  function actions(symbol) {
    return el("div", { class: "row-actions" },
      el("div", { class: "pair" },
        el("button", { class: "icon-btn up-btn", type: "button", title: "Move up", "aria-label": `Move ${symbol} up`, text: "▲",
          onclick: () => move(symbol, -1) }),
        el("button", { class: "icon-btn down-btn", type: "button", title: "Move down", "aria-label": `Move ${symbol} down`, text: "▼",
          onclick: () => move(symbol, 1) })),
      el("button", { class: "icon-btn danger", type: "button", title: "Send into the vortex (remove)", "aria-label": `Remove ${symbol}`, text: "✕",
        onclick: (e) => remove(symbol, e.currentTarget) }));
  }

  async function loadRow(symbol) {
    try {
      fillRow(await api(`/api/stock/${encodeURIComponent(symbol)}`));
    } catch (e) {
      const row = rowOf(symbol);
      if (!row) return;
      row.querySelector(".row-loading")?.replaceWith(el("div", { class: "row-error", text: `${symbol}: ${e.message}` }));
    }
  }

  function fillRow(stock) {
    const row = rowOf(stock.symbol);
    if (!row) return;
    const chg = fmtChange(stock.change, stock.changePercent);
    const canvas = el("canvas", { "aria-label": `${stock.name} 30-day price chart`, role: "img" });
    row.querySelector(".row-loading, .row-error, .row-id")?.remove();
    row.querySelector(".row-price")?.remove();
    row.querySelector(".row-chart")?.remove();
    row.setAttribute("aria-label", `${stock.name} (${stock.symbol}) — open details`);
    row.querySelector(".drag-handle").after(
      el("div", { class: "row-id" },
        el("div", { class: "symbol", text: stock.symbol }),
        el("div", { class: "name", text: stock.name }),
        el("div", { class: "ex", text: stock.exchange || "" })),
      el("div", { class: "row-price" },
        el("div", { class: "price", text: fmtMoney(stock.price, stock.currency) }),
        el("div", { class: `chg ${chg.cls}`, text: chg.text })),
      el("div", { class: "row-chart" }, canvas),
    );
    charts.get(stock.symbol)?.destroy();
    charts.set(stock.symbol, window.CosmosCharts.priceChart(canvas, stock.history, { mini: true, currency: stock.currency }));
  }

  const rowOf = (symbol) => list.querySelector(`.stock-row[data-symbol="${CSS.escape(symbol)}"]`);

  /* ---------------- black hole navigation ---------------- */
  function travel(row, x, y) {
    row.blur();
    enterBlackHole(x, y, `/stock/${encodeURIComponent(row.dataset.symbol)}`, stars);
  }

  /* ---------------- add ---------------- */
  const form = document.getElementById("add-form");
  const input = document.getElementById("add-input");
  const sugg = document.getElementById("suggestions");
  let suggItems = [], active = -1, debounce, searchSeq = 0;

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 2) return hideSugg();
    debounce = setTimeout(() => suggest(q), 250);
  });
  input.addEventListener("keydown", (e) => {
    if (sugg.classList.contains("hidden")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + suggItems.length) % suggItems.length;
      [...sugg.children].forEach((li, i) => li.classList.toggle("active", i === active));
    } else if (e.key === "Escape") {
      hideSugg();
    }
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) hideSugg(); });

  async function suggest(q) {
    const seq = ++searchSeq;
    try {
      const { quotes } = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (seq !== searchSeq) return;
      suggItems = quotes.slice(0, 6);
      active = -1;
      if (!suggItems.length) return hideSugg();
      sugg.replaceChildren(...suggItems.map((s) => el("li", {
        role: "option",
        onclick: () => { hideSugg(); add(s.symbol); },
      }, el("span", { class: "sym", text: s.symbol }), el("span", { text: s.name }), el("span", { class: "ex", text: s.exchange || "" }))));
      sugg.classList.remove("hidden");
    } catch (_) { hideSugg(); }
  }
  function hideSugg() { sugg.classList.add("hidden"); suggItems = []; active = -1; }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const chosen = active >= 0 ? suggItems[active]?.symbol : null;
    hideSugg();
    add(chosen || input.value.trim());
  });

  async function add(query) {
    if (!query) return;
    const btn = document.getElementById("add-btn");
    btn.disabled = true;
    try {
      const { stock } = await api("/api/watchlist", { method: "POST", body: { query } });
      symbols.push(stock.symbol);
      list.querySelector(".empty")?.remove();
      list.append(makeRow(stock.symbol));
      fillRow(stock);
      refreshMoveButtons();
      input.value = "";
      stars.warp(500, 8);
      toast(`${stock.name} entered your orbit ✦`);
      rowOf(stock.symbol).scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- remove into the vortex ---------------- */
  async function remove(symbol, button) {
    const row = rowOf(symbol);
    if (!row || row.classList.contains("sucked")) return;

    const r = row.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const vx = b.left + b.width / 2, vy = b.top + b.height / 2;
    row.style.setProperty("--vx", `${vx - (r.left + r.width / 2)}px`);
    row.style.setProperty("--vy", `${vy - (r.top + r.height / 2)}px`);
    row.style.transformOrigin = "50% 50%";
    row.style.animationDelay = "0ms";

    const vortex = el("div", { class: "vortex", "aria-hidden": "true" });
    vortex.style.left = `${vx}px`;
    vortex.style.top = `${vy}px`;
    document.body.append(vortex);
    row.classList.add("sucked");

    const request = api(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
    await wait(1050);

    // Close the gap the row leaves behind.
    row.style.height = `${row.offsetHeight}px`;
    row.classList.add("collapse");
    void row.offsetHeight;
    Object.assign(row.style, { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "-1rem", borderWidth: "0px" });
    await wait(420);
    vortex.remove();

    try {
      ({ symbols } = await request);
      charts.get(symbol)?.destroy();
      charts.delete(symbol);
      row.remove();
      refreshMoveButtons();
      if (!symbols.length) renderEmpty();
      toast(`${symbol} vanished beyond the event horizon`);
    } catch (e) {
      toast(e.message, true);
      ({ symbols } = await api("/api/watchlist"));
      render();
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- reorder ---------------- */
  function move(symbol, delta) {
    const i = symbols.indexOf(symbol), j = i + delta;
    if (i < 0 || j < 0 || j >= symbols.length) return;
    const row = rowOf(symbol), other = rowOf(symbols[j]);
    if (delta < 0) other.before(row); else other.after(row);
    row.focus();
    saveOrder();
  }

  function refreshMoveButtons() {
    const rows = [...list.querySelectorAll(".stock-row")];
    rows.forEach((row, i) => {
      row.querySelector(".up-btn").disabled = i === 0;
      row.querySelector(".down-btn").disabled = i === rows.length - 1;
    });
  }

  async function saveOrder() {
    const previous = symbols;
    symbols = [...list.querySelectorAll(".stock-row")].map((r) => r.dataset.symbol);
    refreshMoveButtons();
    try {
      await api("/api/watchlist/order", { method: "PUT", body: { symbols } });
    } catch (e) {
      toast(e.message, true);
      symbols = previous;
      render();
    }
  }

  let dragged = null;
  function wireDrag(row) {
    row.addEventListener("dragstart", (e) => {
      dragged = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.symbol);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      list.querySelectorAll(".drop-before, .drop-after").forEach((r) => r.classList.remove("drop-before", "drop-after"));
      dragged = null;
    });
    row.addEventListener("dragover", (e) => {
      if (!dragged || dragged === row) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      row.classList.toggle("drop-before", before);
      row.classList.toggle("drop-after", !before);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
    row.addEventListener("drop", (e) => {
      if (!dragged || dragged === row) return;
      e.preventDefault();
      const before = row.classList.contains("drop-before");
      row.classList.remove("drop-before", "drop-after");
      if (before) row.before(dragged); else row.after(dragged);
      saveOrder();
    });
  }
})();
