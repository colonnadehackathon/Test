/* Sign in / sign up / password reset. */
(function () {
  "use strict";
  const { api } = window.Cosmos;
  const stars = window.Cosmos.starfield();

  const tabs = document.querySelectorAll(".tabs button");
  const forms = { login: "#login-form", signup: "#signup-form", reset: "#reset-form" };

  function show(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    Object.entries(forms).forEach(([k, sel]) => document.querySelector(sel).classList.toggle("active", k === name));
    document.querySelectorAll(".error-msg").forEach((e) => { e.textContent = ""; e.className = "error-msg"; });
    document.querySelector(`${forms[name]} input`).focus();
  }
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => show(b.dataset.goto)));

  function bind(formSel, handler) {
    const form = document.querySelector(formSel);
    const msg = form.querySelector(".error-msg");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      msg.textContent = "";
      msg.className = "error-msg";
      btn.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(form)), msg, form);
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function launch() {
    stars.warp(1500, 60);
    document.querySelector(".universe").classList.add("spaghettify");
    setTimeout(() => (window.location.href = "/"), 1000);
  }

  bind("#login-form", async (d) => {
    await api("/api/auth/login", { method: "POST", body: { username: d.username, password: d.password } });
    launch();
  });

  bind("#signup-form", async (d) => {
    if (d.password !== d.password2) throw new Error("Passwords do not match.");
    await api("/api/auth/signup", {
      method: "POST",
      body: { username: d.username, password: d.password, question: d.question, answer: d.answer },
    });
    launch();
  });

  // Two-step reset: first fetch the question, then submit answer + new password.
  let resetUser = null;
  const step2 = document.getElementById("rs-step2");
  const rsBtn = document.getElementById("rs-submit");
  document.getElementById("rs-user").addEventListener("input", () => {
    resetUser = null;
    step2.classList.add("hidden");
    rsBtn.textContent = "Show my question";
  });

  bind("#reset-form", async (d, msg, form) => {
    if (!resetUser) {
      const { question } = await api("/api/auth/question", { method: "POST", body: { username: d.username } });
      resetUser = d.username;
      document.getElementById("rs-question").textContent = question;
      step2.classList.remove("hidden");
      rsBtn.textContent = "Reset password";
      document.getElementById("rs-a").focus();
      return;
    }
    if (!d.password || d.password !== d.password2) throw new Error("New passwords do not match.");
    await api("/api/auth/reset", {
      method: "POST",
      body: { username: resetUser, answer: d.answer, password: d.password },
    });
    form.reset();
    step2.classList.add("hidden");
    resetUser = null;
    rsBtn.textContent = "Show my question";
    show("login");
    document.getElementById("login-user").value = d.username;
    const loginMsg = document.querySelector("#login-form .error-msg");
    loginMsg.className = "ok-msg";
    loginMsg.textContent = "Password reset. Sign in with your new password.";
    document.getElementById("login-pass").focus();
  });
})();
