/* Shared helpers: API calls, formatting, toast, animated starfield. */
(function () {
  "use strict";

  /* ---------- Motion preference: OS setting, overridable by the Effects toggle ---------- */
  const MOTION_KEY = "cosmos-motion";
  function reducedMotion() {
    try {
      const saved = localStorage.getItem(MOTION_KEY);
      if (saved) return saved === "reduce";
    } catch (_) { /* storage unavailable */ }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function applyMotion() {
    document.documentElement.dataset.motion = reducedMotion() ? "reduce" : "full";
    document.querySelectorAll(".motion-toggle").forEach((b) => {
      const on = !reducedMotion();
      b.setAttribute("aria-pressed", String(on));
      b.textContent = on ? "✦ Effects on" : "✧ Effects off";
    });
  }
  function toggleMotion() {
    try { localStorage.setItem(MOTION_KEY, reducedMotion() ? "full" : "reduce"); } catch (_) { /* ignore */ }
    applyMotion();
  }
  applyMotion();
  document.addEventListener("DOMContentLoaded", applyMotion);
  document.addEventListener("click", (e) => { if (e.target.closest(".motion-toggle")) toggleMotion(); });

  async function api(path, { method = "GET", body } = {}) {
    const opts = { method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw new Error("Cannot reach the mothership (server offline?)");
    }
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      window.location.href = "/login";
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function fmtMoney(v, currency) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency", currency: currency || "USD", maximumFractionDigits: v < 10 ? 4 : 2,
      }).format(v);
    } catch (_) {
      return `${v.toFixed(2)} ${currency || ""}`.trim();
    }
  }

  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v);
  }

  function fmtChange(change, pct) {
    if (change === null || change === undefined) return { text: "—", cls: "" };
    const sign = change >= 0 ? "+" : "";
    const arrow = change >= 0 ? "▲" : "▼";
    return {
      text: `${arrow} ${sign}${change.toFixed(2)} (${sign}${(pct ?? 0).toFixed(2)}%)`,
      cls: change >= 0 ? "up" : "down",
    };
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  let toastTimer;
  function toast(msg, isError = false) {
    let t = document.querySelector(".toast");
    if (!t) { t = el("div", { class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg;
    t.classList.toggle("error", isError);
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- Starfield (canvas) with optional hyperspace warp ---------- */
  function starfield() {
    const canvas = document.getElementById("starfield");
    if (!canvas) return { warp() {} };
    const ctx = canvas.getContext("2d");
    let w, h, stars = [], speed = 0.15, target = 0.15;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = innerWidth * dpr;
      h = canvas.height = innerHeight * dpr;
      const count = Math.round((innerWidth * innerHeight) / 2800);
      stars = Array.from({ length: count }, () => newStar(true));
    }
    function newStar(anywhere) {
      return {
        x: (Math.random() - 0.5) * w,
        y: (Math.random() - 0.5) * h,
        z: anywhere ? Math.random() * w : w,
        hue: [220, 260, 190, 300, 40][Math.floor(Math.random() * 5)],
        tw: Math.random() * Math.PI * 2,
      };
    }
    function frame() {
      speed += (target - speed) * 0.05;
      if (speed > 2) {
        // Leave light trails while in hyperspace.
        ctx.fillStyle = "rgba(3,3,10,0.35)";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      const cx = w / 2, cy = h / 2;
      for (const s of stars) {
        const pz = s.z;
        s.z -= speed * 4;
        s.tw += 0.03;
        if (s.z <= 1) { Object.assign(s, newStar(false)); continue; }
        const k = 128 / s.z, pk = 128 / pz;
        const x = s.x * k + cx, y = s.y * k + cy;
        if (x < 0 || x > w || y < 0 || y > h) { Object.assign(s, newStar(false)); continue; }
        const size = Math.max(0.4, (1 - s.z / w) * 2.4);
        const alpha = Math.min(1, (1 - s.z / w) * 1.4) * (0.65 + 0.35 * Math.sin(s.tw));
        ctx.strokeStyle = ctx.fillStyle = `hsla(${s.hue}, 90%, 85%, ${alpha})`;
        if (speed > 1.5) {
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(s.x * pk + cx, s.y * pk + cy);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    resize();
    addEventListener("resize", resize);
    // When motion is reduced the stars hold still (speed 0) but still render.
    const idle = () => (reducedMotion() ? 0 : 0.15);
    speed = target = idle();
    document.addEventListener("click", (e) => {
      if (e.target.closest(".motion-toggle")) target = idle();
    });
    requestAnimationFrame(frame);

    return {
      /** Accelerate to hyperspace for `ms`, then settle back. */
      warp(ms = 1200, power = 40) {
        if (reducedMotion()) return;
        target = power;
        setTimeout(() => (target = idle()), ms);
      },
    };
  }

  /* ---------- Black hole page transition ---------- */
  function enterBlackHole(x, y, href, stars) {
    if (reducedMotion()) { window.location.href = href; return; }
    const overlay = el("div", { class: "blackhole-overlay" });
    const bh = el("div", { class: "bh" });
    bh.style.left = `${x}px`;
    bh.style.top = `${y}px`;
    overlay.append(bh);
    document.body.append(overlay);
    const universe = document.querySelector(".universe");
    if (universe) {
      universe.style.transformOrigin = `${x}px ${y + window.scrollY}px`;
      universe.classList.add("spaghettify");
    }
    stars && stars.warp(1500, 55);
    try { sessionStorage.setItem("cosmos-arrival", "galaxy"); } catch (_) { /* ignore */ }
    setTimeout(() => (window.location.href = href), 1150);
  }

  /** Play the "emerging into a new galaxy" animation if we came through a black hole. */
  function arrive(stars) {
    let mode = null;
    try { mode = sessionStorage.getItem("cosmos-arrival"); sessionStorage.removeItem("cosmos-arrival"); } catch (_) { /* ignore */ }
    if (!mode) return;
    const universe = document.querySelector(".universe");
    document.body.append(Object.assign(document.createElement("div"), { className: "flash" }));
    setTimeout(() => document.querySelector(".flash")?.remove(), 1000);
    universe?.classList.add("emerge");
    stars && stars.warp(700, 45);
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST", body: {} }); } catch (_) { /* ignore */ }
    window.location.href = "/login";
  }

  window.Cosmos = { reducedMotion, api, fmtMoney, fmtNum, fmtChange, el, toast, starfield, enterBlackHole, arrive, logout };
})();
