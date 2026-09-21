/* global FP */
(function () {
  "use strict";

  var results = {};
  var lastSnap = null;
  var pane = "home";
  var pointerTimer = null;
  var pointerEvents = [];

  var TITLES = {
    canvas: "Canvas",
    webgl: "WebGL",
    screen: "Screen",
    hardware: "CPU / RAM",
    fonts: "Fonts",
    css: "CSS media",
    webaudio: "WebAudio",
    webrtc: "WebRTC",
    pointer: "Pointer",
    aliexpress: "Silent graph",
    diff: "Diff",
    net: "Network"
  };
  var BLURBS = {
    canvas: "2D raster",
    webgl: "GPU renderer",
    screen: "viewport · DPR",
    hardware: "cores · memory",
    fonts: "installed families",
    css: "prefers-*",
    webaudio: "sampleRate",
    webrtc: "ICE / mDNS",
    pointer: "mouse · scroll",
    aliexpress: "gain = 0",
    diff: "snapshot",
    net: "outbound"
  };
  var STATUS_GLOSS = {
    Observed: "API returned a value",
    Inferred: "not a direct read",
    Randomized: "noise added",
    Blocked: "missing or refused",
    "Permission required": "needs a grant",
    Sent: "left device"
  };

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

  function fmt(v) {
    if (v == null || v === "") return "—";
    if (typeof v === "object") return esc(JSON.stringify(v, null, 2));
    return esc(String(v));
  }

  function renderSummary() {
    var s = FP.summarize(window);
    var mem = s.memory == null ? "—" : s.memory + " GB";
    $("summary").innerHTML =
      cell(s.family, "browser") +
      cell(s.screen[0] && s.screen[1] ? s.screen[0] + "×" + s.screen[1] : "—", "screen") +
      cell(s.viewport[0] && s.viewport[1] ? s.viewport[0] + "×" + s.viewport[1] : "—", "view") +
      cell(s.dpr == null ? "—" : s.dpr, "dpr") +
      cell(s.cores == null ? "—" : s.cores, "cores") +
      cell(mem, "ram");
  }

  function cell(v, k) {
    return "<div><b>" + esc(v) + "</b><span>" + k + "</span></div>";
  }

  function railIds() {
    return FP.collectorIds().concat(["aliexpress", "diff", "net"]);
  }

  function listHtml() {
    return railIds()
      .map(function (id) {
        var r = results[id];
        var on = pane === id ? " is-on" : "";
        var run = FP.collectorIds().indexOf(id) >= 0 ? ' data-run="' + id + '"' : "";
        return (
          '<button type="button" class="exp' +
          on +
          '" data-id="' +
          id +
          '"' +
          run +
          '><span class="exp-name">' +
          esc(TITLES[id] || id) +
          '</span><span class="exp-blurb">' +
          esc(BLURBS[id] || "") +
          "</span>" +
          (r && r.status ? chip(r.status) : "") +
          "</button>"
        );
      })
      .join("");
  }

  function renderList() {
    $("list").innerHTML = listHtml();
  }

  function homeHtml() {
    var s = FP.summarize(window);
    var ua = FP.uaFamily(window);
    var rows = [
      ["browser", s.family, ua.status],
      ["screen", s.screen[0] + "×" + s.screen[1], "Observed"],
      ["viewport", s.viewport[0] + "×" + s.viewport[1], "Observed"],
      ["dpr", s.dpr, "Observed"],
      ["cores", s.cores == null ? "—" : s.cores, s.cores == null ? "Blocked" : "Observed"],
      ["memory", s.memory == null ? "—" : s.memory + " GB", s.memory == null ? "Blocked" : "Observed"],
      ["language", s.language || "—", "Observed"]
    ];
    return (
      "<h2>Harvest</h2>" +
      '<dl class="harvest">' +
      rows
        .map(function (row) {
          return (
            "<div><dt>" +
            esc(row[0]) +
            "</dt><dd>" +
            esc(row[1] == null ? "—" : row[1]) +
            "</dd>" +
            chip(row[2]) +
            "</div>"
          );
        })
        .join("") +
      "</dl>"
    );
  }

  function detailHtml(r) {
    var rows = FP.DETAIL_FIELDS.map(function (k) {
      var label = FP.DETAIL_LABELS[k];
      if (!label) return "";
      var wide = k === "learned" || k === "codeExecuted";
      var body =
        k === "learned" && r.learnedValue && typeof r.learnedValue === "object"
          ? "<pre>" + fmt(r.learnedValue) + "</pre>"
          : "<div>" + fmt(r[k]) + "</div>";
      return (
        "<div" +
        (wide ? ' class="wide"' : "") +
        "><dt>" +
        esc(label) +
        "</dt><dd>" +
        body +
        "</dd></div>"
      );
    }).join("");
    return (
      "<h2>" +
      esc(r.title) +
      " " +
      chip(r.status) +
      '</h2><dl class="sheet-grid">' +
      rows +
      "</dl>"
    );
  }

  function showPane(id) {
    pane = id;
    $("detail").hidden = !(id === "home" || (results[id] && FP.collectorIds().indexOf(id) >= 0));
    $("aliexpress").hidden = id !== "aliexpress";
    $("diff-pane").hidden = id !== "diff";
    $("net-pane").hidden = id !== "net";
    if (id === "home") $("detail").innerHTML = homeHtml();
    else if (results[id] && FP.collectorIds().indexOf(id) >= 0) $("detail").innerHTML = detailHtml(results[id]);
    else if (FP.collectorIds().indexOf(id) >= 0) {
      $("detail").hidden = false;
      $("detail").innerHTML = "<h2>" + esc(TITLES[id]) + '</h2><p class="empty">Running…</p>';
    }
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
    showPane(id);
    if (id === "pointer") startPointer();
    return FP.runCollector(id, env()).then(function (r) {
      results[id] = r;
      if (pane === id) $("detail").innerHTML = detailHtml(r);
      renderList();
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
      if (pane === "pointer") $("detail").innerHTML = detailHtml(r);
    }, 2500);
  }

  function renderLegend() {
    $("legend").innerHTML = FP.STATUSES.map(function (s) {
      return "<li>" + chip(s) + "<b>" + esc(STATUS_GLOSS[s] || "") + "</b></li>";
    }).join("");
    $("modes").innerHTML = FP.PROTECTION.map(function (p) {
      return "<li><b>" + esc(p.mode) + "</b> " + esc(p.note) + "</li>";
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
    renderLegend();
    showNet(FP.networkPayload());
    aliFacts();
    showPane("home");

    $("list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-id]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (id === "aliexpress" || id === "diff" || id === "net") {
        showPane(id);
        return;
      }
      run(id);
    });

    $("ali-start").addEventListener("click", function () {
      FP.startAliExpress(env()).then(function (rec) {
        if (rec && rec.id) results.aliexpress = rec;
        aliFacts(rec);
        renderList();
      });
    });
    $("ali-stop").addEventListener("click", function () {
      FP.stopAliExpress();
      delete results.aliexpress;
      aliFacts();
      renderList();
    });

    $("snap-capture").addEventListener("click", function () {
      lastSnap = FP.snapshotFromResults(
        Object.keys(results).map(function (k) {
          return results[k];
        })
      );
      try {
        localStorage.setItem("observe-snap", FP.encodeSnapshot(lastSnap));
      } catch (e) {}
      $("snap-paste").value = FP.encodeSnapshot(lastSnap);
    });

    $("snap-compare").addEventListener("click", function () {
      var captured = lastSnap;
      try {
        if (!captured) captured = FP.parseSnapshot(localStorage.getItem("observe-snap") || "");
      } catch (e) {
        captured = null;
      }
      var current = Object.keys(results).map(function (k) {
        return results[k];
      });
      var pair = FP.pairForCompare(captured, $("snap-paste").value, current);
      if (!pair.a || !pair.a.fields) {
        $("diff-out").innerHTML = '<p class="empty">Capture first.</p>';
        return;
      }
      var rows = FP.diffSnapshots(pair.a, pair.b);
      if (!rows.length) {
        $("diff-out").innerHTML = '<p class="empty">No fields.</p>';
        return;
      }
      $("diff-out").innerHTML =
        '<table class="diff"><thead><tr><th>field</th><th>state</th><th>a</th><th>b</th></tr></thead><tbody>' +
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
        "</tbody></table>";
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
      if (pane === "home") $("detail").innerHTML = homeHtml();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
