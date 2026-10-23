/* Sweat or Pay: Rückmeldung für Buttons (Druckeffekt, Welle, Vibration, Ladezustand, Zahlen-Animation). */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canVibrate = typeof navigator.vibrate === "function";

  function hapticOn() {
    try { return localStorage.getItem("sop_haptics") !== "0"; } catch (e) { return true; }
  }
  var PATTERNS = { tap: 8, select: 6, step: 10, success: [14, 50, 22], goal: [16, 40, 16, 40, 34], error: [40, 50, 40], rank: [30, 60, 30, 60, 80] };
  function haptic(kind) {
    if (!canVibrate || !hapticOn()) return;
    try { navigator.vibrate(PATTERNS[kind] || 8); } catch (e) { /* nicht schlimm */ }
  }

  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    var off = function () { el.classList.remove(cls); el.removeEventListener("animationend", off); };
    el.addEventListener("animationend", off);
  }

  /* Schwebende Zahl, z. B. "+10" über dem Zähler */
  function floatText(text, x, y, cls) {
    if (reduce) return;
    var n = document.createElement("div");
    n.className = "floatTxt " + (cls || "");
    n.textContent = text;
    n.style.left = x + "px";
    n.style.top = y + "px";
    document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 1000);
  }

  function bump(input, delta) {
    if (!input) return;
    restart(input, delta < 0 ? "bumpDown" : "bump");
    var r = input.getBoundingClientRect();
    floatText((delta < 0 ? "−" : "+") + Math.abs(delta), r.left + r.width / 2, r.top + 6, delta < 0 ? "neg" : "pos");
  }

  function goalHit(bar, label) {
    if (!bar) return;
    haptic("goal");
    var track = bar.parentElement;
    if (track) restart(track, "hit");
    var r = bar.getBoundingClientRect();
    floatText(label || "Ziel ✓", r.left + Math.min(r.width, 200) / 2, r.top - 8, "goal");
  }

  /* Ladezustand mit festgehaltener Breite */
  function busy(btn, on) {
    if (!btn) return;
    if (on) {
      if (btn.classList.contains("isBusy")) return;
      btn.style.minWidth = btn.offsetWidth + "px";
      btn.classList.add("isBusy");
    } else {
      btn.classList.remove("isBusy");
      if (!btn.classList.contains("isDone")) btn.style.minWidth = "";
    }
  }

  function done(btn, label, ms) {
    if (!btn) return;
    if (btn._doneTimer) clearTimeout(btn._doneTimer);
    var original = btn._origLabel != null ? btn._origLabel : btn.textContent;
    btn._origLabel = original;
    busy(btn, false);
    btn.style.minWidth = btn.offsetWidth + "px";
    btn.textContent = label || "Fertig ✓";
    btn.classList.add("isDone");
    restart(btn, "donePop");
    btn._doneTimer = setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove("isDone");
      btn.style.minWidth = "";
      btn._origLabel = null;
    }, ms || 1700);
  }

  function fail(btn) {
    if (!btn) return;
    busy(btn, false);
    restart(btn, "shake");
    haptic("error");
  }

  window.SOPUI = { haptic: haptic, busy: busy, done: done, fail: fail, bump: bump, goalHit: goalHit, floatText: floatText, restart: restart, canVibrate: canVibrate };

  /* ---------- Welle unter dem Finger + Druck-Rückmeldung ---------- */
  var RIPPLE = "button:not(.link):not(.whoBadge), .listItem, .choice";
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var t = e.target.closest && e.target.closest(RIPPLE);
    if (!t || t.disabled) return;
    if (t.classList.contains("chip")) restart(t, "pop");
    if (reduce) return;
    var r = t.getBoundingClientRect();
    var d = Math.max(r.width, r.height) * 2.1;
    var s = document.createElement("span");
    s.className = "ripple";
    s.style.setProperty("--d", d + "px");
    s.style.setProperty("--x", e.clientX - r.left + "px");
    s.style.setProperty("--y", e.clientY - r.top + "px");
    t.appendChild(s);
    setTimeout(function () { s.remove(); }, 700);
  }, { passive: true });

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button, .listItem, .choice, .ach, input.switch");
    if (!t || t.disabled) return;
    if (t.closest(".stepper, .quick")) return;
    if (t.closest(".tabbar")) { haptic("select"); return; }
    if (t.classList.contains("link")) return;
    haptic("tap");
    if (t.classList.contains("ach")) restart(t, "pop");
  });

  /* ---------- Tab-Leiste: Anzeige gleitet zum aktiven Reiter ---------- */
  var TAB_COLORS = ["var(--tab1)", "var(--tab2)", "var(--tab5)", "var(--tab6)"];
  function syncTabbar() {
    var inner = document.querySelector(".tabbarInner");
    if (!inner) return;
    var btns = inner.querySelectorAll("button");
    var idx = 0;
    btns.forEach(function (b, i) { if (b.classList.contains("active")) idx = i; });
    inner.style.setProperty("--n", btns.length);
    inner.style.setProperty("--i", idx);
    inner.style.setProperty("--tc", TAB_COLORS[idx % TAB_COLORS.length]);
  }

  /* ---------- Buttons: während einer Anfrage "disabled" => Ladekreis ---------- */
  function watchDisabled() {
    var timers = new WeakMap();
    var mo = new MutationObserver(function (list) {
      list.forEach(function (m) {
        var b = m.target;
        if (!(b instanceof HTMLButtonElement) || !b.classList.contains("primary")) return;
        var t = timers.get(b);
        if (t) { clearTimeout(t); timers.delete(b); }
        if (b.disabled) {
          timers.set(b, setTimeout(function () { if (b.disabled && !b.classList.contains("isDone")) busy(b, true); }, 250));
        } else if (b.classList.contains("isBusy")) {
          busy(b, false);
        }
      });
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
  }

  /* ---------- Zahlen zählen hoch statt zu springen ---------- */
  function tween(el) {
    var lastSet = null, shown = null, raf = 0, fin = 0;
    function parse(txt) {
      var m = /^(\d+)(.*)$/.exec(txt.trim());
      return m ? { n: parseInt(m[1], 10), rest: m[2] } : null;
    }
    function put(text) { lastSet = text; el.textContent = text; }
    new MutationObserver(function () {
      var txt = el.textContent;
      if (txt === lastSet) return;
      var p = parse(txt);
      if (!p) { shown = null; return; }
      var from = shown == null ? 0 : shown;
      cancelAnimationFrame(raf);
      clearTimeout(fin);
      if (reduce || document.hidden || p.n === from) { shown = p.n; lastSet = txt; return; }
      var target = p.n + p.rest;
      var t0 = performance.now(), dur = Math.min(900, 250 + Math.abs(p.n - from) * 12);
      put(from + p.rest);
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        shown = Math.round(from + (p.n - from) * e);
        put(shown + p.rest);
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
      /* Falls der Bildschirm gerade nicht gezeichnet wird: Zielwert trotzdem setzen */
      fin = setTimeout(function () { cancelAnimationFrame(raf); shown = p.n; put(target); }, dur + 150);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  function init() {
    watchDisabled();
    ["ringPct", "streakNum"].forEach(function (id) { var el = document.getElementById(id); if (el) tween(el); });
    var inner = document.querySelector(".tabbarInner");
    if (inner) {
      new MutationObserver(syncTabbar).observe(inner, { subtree: true, attributes: true, attributeFilter: ["class"] });
      syncTabbar();
    }
    var hp = document.getElementById("hapticToggle");
    if (hp) {
      var row = hp.closest(".switchRow");
      if (row && !canVibrate) row.hidden = true;
      hp.checked = hapticOn();
      hp.addEventListener("change", function () {
        try { localStorage.setItem("sop_haptics", hp.checked ? "1" : "0"); } catch (e) { /* ok */ }
        if (hp.checked) haptic("success");
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
