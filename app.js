/* global FP */
(function () {
  "use strict";

  var results = {};
  var lastSnap = null;
  var activeId = null;
  var pointerTimer = null;
  var pointerEvents = [];

  function $(id) {
    return document.getElementById(id);
  }

  function chip(status) {
    var cls = "chip chip-" + (status === "Permission required" ? "Permission" : status);
    return '<span class="' + cls + '">' + status + "</span>";
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function fmtLearned(v) {
    if (v == null || v === "") return "—";
    if (typeof v === "object") return esc(JSON.stringify(v, null, 2));
    return esc(String(v));
  }

  function renderSummary() {
    var s = FP.summarize(window);
    var mem = s.memory == null ? "—" : s.memory + " GB";
    var cores = s.cores == null ? "—" : s.cores;
    var dpr = s.dpr == null ? "—" : s.dpr;
    var screen = s.screen[0] && s.screen[1] ? s.screen[0] + "×" + s.screen[1] : "—";
    var view = s.viewport[0] && s.viewport[1] ? s.viewport[0] + "×" + s.viewport[1] : "—";
    $("summary").innerHTML =
      cell(s.family, "browser") +
      cell(screen, "screen") +
      cell(view, "viewport") +
      cell(dpr, "dpr") +
      cell(cores, "cores") +
      cell(mem, "memory");
  }

  function cell(v, k) {
    return "<div><b>" + esc(v) + "</b><span>" + k + "</span></div>";
  }

  var TITLES = {
    canvas: "Canvas",
    webgl: "WebGL",
    screen: "Screen / viewport",
    hardware: "CPU / memory",
    fonts: "Fonts",
    css: "CSS media",
    webaudio: "WebAudio",
    webrtc: "WebRTC",
    pointer: "Pointer / scroll",
    aliexpress: "AliExpress graph"
  };
  var BLURBS = {
    canvas: "2D raster",
    webgl: "GPU renderer",
    screen: "viewport + DPR",
    hardware: "core / RAM hints",
    fonts: "installed families",
    css: "prefers-* / pointer",
    webaudio: "context props",
    webrtc: "ICE / mDNS",
    pointer: "mouse, scroll, touch"
  };
  var STATUS_GLOSS = {
    Observed: "API returned a value",
    Inferred: "not a direct read",
    Randomized: "noise added",
    Blocked: "missing or refused",
    "Permission required": "needs a grant",
    Sent: "left this device"
  };

  function listHtml() {
    return FP.collectorIds()
      .map(function (id) {
        var r = results[id];
        var statusChip = r ? chip(r.status) : "";
        var on = id === activeId ? " is-on" : "";
        return (
          '<button type="button" class="exp' +
          on +
          '" data-id="' +
          id +
          '" data-run="' +
          id +
          '" aria-controls="detail" aria-expanded="' +
          (id === activeId ? "true" : "false") +
          '"><span class="exp-name">' +
          esc(TITLES[id] || id) +
          '</span><span class="exp-blurb">' +
          esc(BLURBS[id] || "") +
          "</span>" +
          statusChip +
          '<span class="exp-go">' +
          (r ? "Again" : "Run") +
          "</span></button>"
        );
      })
      .join("");
  }

  function placeDetail() {
    var d = $("detail");
    if (!d) return;
    if (!activeId || !results[activeId]) {
      d.hidden = true;
      return;
    }
    var row = document.querySelector('.exp[data-id="' + activeId + '"]');
    if (row) row.after(d);
    d.hidden = false;
  }

  function renderList() {
    var d = $("detail");
    var list = $("list");
    if (d && d.parentNode === list) list.parentNode.appendChild(d);
    list.innerHTML = listHtml();
    placeDetail();
  }

  function renderDetail(id) {
    var r = results[id];
    var el = $("detail");
    activeId = id;
    if (!r) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    var rows = FP.DETAIL_FIELDS.map(function (k) {
      var wide = k === "learned" || k === "codeExecuted";
      var val = r[k];
      var body =
        k === "learned" && r.learnedValue && typeof r.learnedValue === "object"
          ? "<pre>" + fmtLearned(r.learnedValue) + "</pre>"
          : "<div>" + fmtLearned(val) + "</div>";
      return (
        '<div' +
        (wide ? ' class="wide"' : "") +
        "><dt>" +
        esc(FP.DETAIL_LABELS[k]) +
        "</dt><dd>" +
        body +
        "</dd></div>"
      );
    }).join("");
    el.innerHTML =
      "<h3>" +
      esc(r.title) +
      " " +
      chip(r.status) +
      '</h3><dl class="sheet-grid">' +
      rows +
      "</dl>";
    renderList();
  }

  function env() {
    return {
      window: window,
      document: document,
      navigator: navigator,
      screen: screen,
      AudioContext: window.AudioContext,
      webkitAudioContext: window.webkitAudioContext,
      RTCPeerConnection: window.RTCPeerConnection
    };
  }

  function run(id) {
    var btn = document.querySelector('[data-run="' + id + '"]');
    if (btn) {
      btn.disabled = true;
      var go = btn.querySelector(".exp-go");
      if (go) go.textContent = "…";
    }
    if (id === "pointer") startPointer();
    return FP.runCollector(id, env()).then(function (r) {
      results[id] = r;
      renderDetail(id);
    });
  }

  function startPointer() {
    pointerEvents = [];
    if (pointerTimer) clearTimeout(pointerTimer);
    function onMove(e) {
      pointerEvents.push({
        type: "pointer",
        dx: e.movementX,
        dy: e.movementY,
        pressure: e.pressure,
        pointerType: e.pointerType
      });
    }
    function onScroll(e) {
      pointerEvents.push({ type: "scroll", deltaY: e.deltaY, deltaMode: e.deltaMode });
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    pointerTimer = setTimeout(function () {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("wheel", onScroll);
      var r = results.pointer;
      if (!r) return;
      var sum = FP.summarizePointerEvents(pointerEvents);
      r.learnedValue = Object.assign({}, r.learnedValue, sum);
      r.learned = JSON.stringify(r.learnedValue);
      if (activeId === "pointer") renderDetail("pointer");
      else renderList();
    }, 2500);
  }

  function renderLegend() {
    $("legend").innerHTML =
      '<ul class="tax-grid">' +
      FP.STATUSES.map(function (s) {
        return "<li>" + chip(s) + "<b>" + esc(STATUS_GLOSS[s] || "") + "</b></li>";
      }).join("") +
      "</ul>";
    $("modes").innerHTML = FP.PROTECTION.map(function (p) {
      return "<li><b>" + esc(p.mode) + "</b>" + esc(p.note) + "</li>";
    }).join("");
  }

  function aliFacts(rec) {
    var st = FP.getAliExpressState();
    if (rec && rec.status === "Blocked") {
      $("ali-audible").textContent = "no";
      $("ali-ctx").textContent = "blocked";
      $("ali-dest").textContent = "disconnected";
      $("ali-ent").textContent = "n/a";
      $("ali-start").disabled = false;
      $("ali-stop").disabled = true;
      return;
    }
    $("ali-audible").textContent = st.started ? "no" : "—";
    $("ali-ctx").textContent = st.graph && st.graph.ctxState ? st.graph.ctxState : st.started ? "active" : "idle";
    $("ali-dest").textContent = st.started ? "connected" : "disconnected";
    var ent = "untested";
    if (rec && rec.learnedValue && rec.learnedValue.sampleRate) {
      var sr = rec.learnedValue.sampleRate;
      ent = sr === 44100 || sr === 48000 ? "reduced" : "see detail";
    }
    $("ali-ent").textContent = st.started ? ent : "untested";
    $("ali-start").disabled = !!st.started;
    $("ali-stop").disabled = !st.started;
  }

  function showNet(p) {
    if (!p || !p.payload) {
      $("net-out").textContent = "0 bytes left this device";
      return;
    }
    $("net-out").textContent = JSON.stringify(p, null, 2);
  }

  function boot() {
    if (location.protocol === "file:") $("file-hint").hidden = false;
    renderSummary();
    renderList();
    renderLegend();
    showNet(FP.networkPayload());
    aliFacts();

    $("list").addEventListener("click", function (e) {
      var runBtn = e.target.closest("[data-run]");
      if (runBtn) {
        e.preventDefault();
        run(runBtn.getAttribute("data-run"));
      }
    });

    $("ali-start").addEventListener("click", function () {
      FP.startAliExpress(env()).then(function (rec) {
        if (rec && rec.id) results.aliexpress = rec;
        aliFacts(rec);
      });
    });
    $("ali-stop").addEventListener("click", function () {
      FP.stopAliExpress();
      aliFacts();
    });

    $("snap-capture").addEventListener("click", function () {
      var list = Object.keys(results).map(function (k) {
        return results[k];
      });
      lastSnap = FP.snapshotFromResults(list);
      try {
        localStorage.setItem("observe-snap", FP.encodeSnapshot(lastSnap));
      } catch (e) {}
      $("snap-paste").value = FP.encodeSnapshot(lastSnap);
    });

    $("snap-compare").addEventListener("click", function () {
      var a = lastSnap;
      try {
        if (!a) a = FP.parseSnapshot(localStorage.getItem("observe-snap") || "");
      } catch (e) {
        a = null;
      }
      var b;
      try {
        b = FP.parseSnapshot($("snap-paste").value);
      } catch (e2) {
        b = FP.snapshotFromResults(
          Object.keys(results).map(function (k) {
            return results[k];
          })
        );
      }
      if (!a || !a.fields) {
        $("diff-out").innerHTML = '<p class="empty">Capture first.</p>';
        return;
      }
      var rows = FP.diffSnapshots(a, b);
      if (!rows.length) {
        $("diff-out").innerHTML = '<p class="empty">No fields.</p>';
        return;
      }
      $("diff-out").innerHTML =
        '<div class="sheet"><table class="diff"><thead><tr><th>field</th><th>state</th><th>a</th><th>b</th></tr></thead><tbody>' +
        rows
          .map(function (r) {
            return (
              "<tr><td>" +
              esc(r.field) +
              '</td><td class="st-' +
              r.state +
              '">' +
              r.state +
              "</td><td>" +
              esc(JSON.stringify(r.a)) +
              "</td><td>" +
              esc(JSON.stringify(r.b)) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>";
    });

    $("net-preview").addEventListener("click", function () {
      showNet(
        FP.networkPayload({
          optIn: true,
          results: Object.keys(results).map(function (k) {
            return { id: results[k].id, status: results[k].status, learned: results[k].learned };
          })
        })
      );
    });

    window.addEventListener("resize", function () {
      renderSummary();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
