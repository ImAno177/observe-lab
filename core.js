/* global window */
(function (global) {
  "use strict";

  var STATUSES = [
    "Observed",
    "Inferred",
    "Randomized",
    "Blocked",
    "Permission required",
    "Sent"
  ];

  var DETAIL_FIELDS = [
    "codeExecuted",
    "learned",
    "stability",
    "intervention",
    "tracking",
    "sideEffects",
    "network"
  ];

  var DETAIL_LABELS = {
    codeExecuted: "API",
    learned: "Got",
    stability: "",
    intervention: "Protect",
    tracking: "Use",
    sideEffects: "Cost",
    network: "Net"
  };

  var MEMORY_BUCKETS = [0.25, 0.5, 1, 2, 4, 8];
  var FONT_PROBE = [
    "Arial",
    "Verdana",
    "Helvetica",
    "Times New Roman",
    "Courier New",
    "Georgia",
    "Comic Sans MS",
    "Trebuchet MS",
    "Impact",
    "Tahoma",
    "Segoe UI",
    "Roboto",
    "Menlo",
    "Monaco",
    "Consolas",
    "Noto Sans",
    "Ubuntu",
    "DejaVu Sans",
    "Lucida Console",
    "Palatino Linotype"
  ];

  var MEDIA_QUERIES = [
    "(prefers-color-scheme: dark)",
    "(prefers-color-scheme: light)",
    "(prefers-reduced-motion: reduce)",
    "(prefers-contrast: more)",
    "(forced-colors: active)",
    "(hover: hover)",
    "(pointer: fine)",
    "(pointer: coarse)",
    "(any-pointer: coarse)",
    "(color-gamut: p3)",
    "(dynamic-range: high)",
    "(prefers-reduced-data: reduce)"
  ];

  var ALIEXPRESS_GRAPH = [
    { type: "oscillator" },
    { type: "analyser" },
    { type: "processor" },
    { type: "gain", gain: 0 },
    { type: "destination" }
  ];

  var ALIEXPRESS_AUTO_START = false;
  var ALIEXPRESS_CONNECTIONS = [
    ["oscillator", "analyser"],
    ["analyser", "processor"],
    ["processor", "gain"],
    ["gain", "destination"]
  ];

  var aliState = { started: false, ctx: null, graph: null };

  function finish(partial) {
    var r = {};
    r.id = partial.id || "unknown";
    r.title = partial.title || r.id;
    r.status = STATUSES.indexOf(partial.status) >= 0 ? partial.status : "Blocked";
    DETAIL_FIELDS.forEach(function (k) {
      r[k] = partial[k] == null ? "" : partial[k];
    });
    if (partial.learnedValue !== undefined) r.learnedValue = partial.learnedValue;
    return r;
  }

  function blocked(id, title, why) {
    return finish({
      id: id,
      title: title,
      status: "Blocked",
      codeExecuted: why.code || "",
      learned: "unavailable",
      learnedValue: null,
      stability: "n/a",
      intervention: why.intervention || "missing",
      tracking: "none",
      sideEffects: why.side || "none",
      network: "0 B"
    });
  }

  function permission(id, title, why) {
    return finish({
      id: id,
      title: title,
      status: "Permission required",
      codeExecuted: why.code || "",
      learned: "not read",
      learnedValue: null,
      stability: "n/a",
      intervention: "ask",
      tracking: "none",
      sideEffects: "prompt",
      network: "0 B"
    });
  }

  function isDenied(err) {
    return err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
  }

  function json(v) {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  }

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }

  function nav(env) {
    return env.navigator || {};
  }

  function win(env) {
    return env.window || env;
  }

  function uaFamily(env) {
    var n = nav(env);
    var ua = n.userAgent || "";
    if (n.brave) return { family: "Brave", status: "Inferred", how: "navigator.brave" };
    if (/Firefox\//.test(ua)) return { family: "Firefox", status: "Observed", how: "userAgent" };
    if (/Edg\//.test(ua)) return { family: "Edge", status: "Observed", how: "userAgent" };
    if (/OPR\//.test(ua)) return { family: "Opera", status: "Observed", how: "userAgent" };
    if (/Safari/.test(ua) && !/Chrome|Chromium/.test(ua))
      return { family: "Safari", status: "Observed", how: "userAgent" };
    if (/Chrome\//.test(ua)) return { family: "Chrome", status: "Observed", how: "userAgent" };
    return { family: "Other", status: "Inferred", how: "userAgent" };
  }

  function summarize(env) {
    var n = nav(env);
    var w = win(env);
    var s = env.screen || w.screen || {};
    var ua = uaFamily(env);
    var mem = n.deviceMemory;
    return {
      family: ua.family,
      familyStatus: ua.status,
      language: n.language || "",
      platform: n.platform || "",
      cores: n.hardwareConcurrency,
      memory: mem,
      dpr: w.devicePixelRatio,
      screen: [s.width, s.height],
      viewport: [w.innerWidth, w.innerHeight]
    };
  }

  function collectCanvas(env) {
    var id = "canvas";
    var title = "Canvas";
    var code = "canvas.getContext('2d'); fillText; toDataURL";
    try {
      var doc = env.document;
      if (!doc || typeof doc.createElement !== "function")
        return blocked(id, title, { code: code, intervention: "no document" });
      function draw() {
        var c = doc.createElement("canvas");
        if (!c || typeof c.getContext !== "function") return { err: "no canvas" };
        c.width = 240;
        c.height = 32;
        var ctx = c.getContext("2d");
        if (!ctx) return { err: "no 2d" };
        ctx.textBaseline = "top";
        ctx.font = "16px Arial";
        ctx.fillStyle = "#0A4F4C";
        ctx.fillRect(0, 0, 240, 32);
        ctx.fillStyle = "#1A2A32";
        ctx.fillText("Cwm fjordbank glyphs vext quiz", 2, 8);
        if (typeof c.toDataURL !== "function") return { err: "no toDataURL" };
        return { url: c.toDataURL() };
      }
      var a = draw();
      var b = draw();
      if (a.err) return blocked(id, title, { code: code, intervention: a.err });
      var randomized = a.url !== b.url;
      return finish({
        id: id,
        title: title,
        status: randomized ? "Randomized" : "Observed",
        codeExecuted: code,
        learned: "raster " + a.url.length + "B digest " + djb2(a.url),
        learnedValue: { bytes: a.url.length, digest: djb2(a.url) },
        stability: "GPU/OS",
        intervention: randomized ? "noisy now" : "may farble",
        tracking: "high if stable",
        sideEffects: "CPU",
        network: "0 B"
      });
    } catch (e) {
      if (isDenied(e)) return permission(id, title, { code: code });
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectWebGL(env) {
    var id = "webgl";
    var title = "WebGL";
    var code = "getContext('webgl'); getParameter(VENDOR/RENDERER); debug_renderer_info";
    try {
      var doc = env.document;
      if (!doc || typeof doc.createElement !== "function")
        return blocked(id, title, { code: code, intervention: "no document" });
      var c = doc.createElement("canvas");
      var gl =
        c && c.getContext && (c.getContext("webgl") || c.getContext("experimental-webgl"));
      if (!gl) return blocked(id, title, { code: code, intervention: "no webgl context" });
      var vendor = gl.getParameter(gl.VENDOR);
      var renderer = gl.getParameter(gl.RENDERER);
      var unmasked = null;
      var ext = gl.getExtension && gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        unmasked = {
          vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        };
      }
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: json({ vendor: vendor, renderer: renderer, unmasked: unmasked }),
        learnedValue: { vendor: vendor, renderer: renderer, unmasked: unmasked },
        stability: "per GPU",
        intervention: ext ? "unmasked" : "masked",
        tracking: "high if unmasked",
        sideEffects: "GPU",
        network: "0 B"
      });
    } catch (e) {
      if (isDenied(e)) return permission(id, title, { code: code });
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectScreen(env) {
    var id = "screen";
    var title = "Screen / viewport";
    var code = "screen.width/height; innerWidth/Height; devicePixelRatio";
    try {
      var w = win(env);
      var s = env.screen || w.screen;
      if (!s) return blocked(id, title, { code: code, intervention: "no screen" });
      var learned = {
        width: s.width,
        height: s.height,
        availWidth: s.availWidth,
        availHeight: s.availHeight,
        colorDepth: s.colorDepth,
        dpr: w.devicePixelRatio,
        innerWidth: w.innerWidth,
        innerHeight: w.innerHeight
      };
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: json(learned),
        learnedValue: learned,
        stability: "viewport moves",
        intervention: "size may round",
        tracking: "joiner",
        sideEffects: "none",
        network: "0 B"
      });
    } catch (e) {
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectHardware(env) {
    var id = "hardware";
    var title = "CPU / memory";
    var code = "navigator.hardwareConcurrency; navigator.deviceMemory";
    try {
      var n = nav(env);
      var cores = n.hardwareConcurrency;
      var mem = n.deviceMemory;
      if (cores == null && mem == null)
        return blocked(id, title, { code: code, intervention: "both hints omitted" });
      var memBucket = mem != null && MEMORY_BUCKETS.indexOf(mem) >= 0;
      var learned = { hardwareConcurrency: cores, deviceMemory: mem };
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: json(learned),
        learnedValue: learned,
        stability: "stable",
        intervention: memBucket ? "memory bucketed" : "cores may spoof",
        tracking: "joiner",
        sideEffects: "none",
        network: "0 B"
      });
    } catch (e) {
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectFonts(env) {
    var id = "fonts";
    var title = "Fonts";
    var code = "canvas measureText vs base sans/serif/mono";
    try {
      var doc = env.document;
      if (!doc || typeof doc.createElement !== "function")
        return blocked(id, title, { code: code, intervention: "no document" });
      var c = doc.createElement("canvas");
      var ctx = c && c.getContext && c.getContext("2d");
      if (!ctx || typeof ctx.measureText !== "function")
        return blocked(id, title, { code: code, intervention: "no TextMetrics" });
      function width(font) {
        ctx.font = "16px " + font;
        return ctx.measureText("mmmmmmmmmmlli").width;
      }
      var bases = {
        sans: width("sans-serif"),
        serif: width("serif"),
        mono: width("monospace")
      };
      var present = [];
      FONT_PROBE.forEach(function (name) {
        var w = width("'" + name + "', monospace");
        if (w !== bases.mono) present.push(name);
      });
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: present.length + " / " + FONT_PROBE.length + " " + present.join(", "),
        learnedValue: { present: present, probed: FONT_PROBE.length },
        stability: "until install",
        intervention: "RFP may shrink",
        tracking: "high on desktop",
        sideEffects: "CPU",
        network: "0 B"
      });
    } catch (e) {
      if (isDenied(e)) return permission(id, title, { code: code });
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectCss(env) {
    var id = "css";
    var title = "CSS media";
    var code = "matchMedia('(prefers-*)')";
    try {
      var w = win(env);
      if (typeof w.matchMedia !== "function")
        return blocked(id, title, { code: code, intervention: "no matchMedia" });
      var hits = [];
      MEDIA_QUERIES.forEach(function (q) {
        var m = w.matchMedia(q);
        if (m && m.matches) hits.push(q);
      });
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: hits.length ? hits.join("; ") : "no listed queries matched",
        learnedValue: { matches: hits },
        stability: "per profile",
        intervention: "rarely noisy",
        tracking: "joiner",
        sideEffects: "none",
        network: "0 B"
      });
    } catch (e) {
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectWebAudio(env) {
    var id = "webaudio";
    var title = "WebAudio";
    var code = "new AudioContext(); sampleRate; baseLatency; close() — no destination graph";
    try {
      var AC = env.AudioContext || env.webkitAudioContext;
      if (!AC) return blocked(id, title, { code: code, intervention: "no AudioContext" });
      var ctx = new AC();
      var learned = {
        sampleRate: ctx.sampleRate,
        state: ctx.state,
        baseLatency: ctx.baseLatency,
        outputLatency: ctx.outputLatency,
        maxChannelCount: ctx.destination && ctx.destination.maxChannelCount
      };
      if (typeof ctx.close === "function") ctx.close();
      var coarse = learned.sampleRate === 44100 || learned.sampleRate === 48000;
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: json(learned),
        learnedValue: learned,
        stability: "rate stable",
        intervention: coarse ? "rate bucketed" : "rate odd",
        tracking: "weak",
        sideEffects: "may wake audio",
        network: "0 B"
      });
    } catch (e) {
      if (isDenied(e)) return permission(id, title, { code: code });
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function collectWebRTC(env) {
    var id = "webrtc";
    var title = "WebRTC";
    var code = "RTCPeerConnection({iceServers:[]}); createOffer; local candidates";
    var RTC = env.RTCPeerConnection;
    if (!RTC) return Promise.resolve(blocked(id, title, { code: code, intervention: "no RTCPeerConnection" }));
    return new Promise(function (resolve) {
      var pc;
      try {
        pc = new RTC({ iceServers: [] });
      } catch (e) {
        if (isDenied(e)) return resolve(permission(id, title, { code: code }));
        return resolve(blocked(id, title, { code: code, intervention: String(e.message || e) }));
      }
      var candidates = [];
      var done = false;
      function finishRtc() {
        if (done) return;
        done = true;
        try {
          pc.close();
        } catch (e2) {}
        var types = {};
        candidates.forEach(function (c) {
          var t = (c.type || (/\btyp (\w+)/.exec(c.candidate || "") || [])[1] || "unknown");
          types[t] = (types[t] || 0) + 1;
        });
        resolve(
          finish({
            id: id,
            title: title,
            status: "Observed",
            codeExecuted: code,
            learned: json({ count: candidates.length, types: types }),
            learnedValue: { count: candidates.length, types: types, raw: candidates },
            stability: "mDNS rotates",
            intervention: "no STUN",
            tracking: "low",
            sideEffects: "ICE",
            network: "0 B"
          })
        );
      }
      pc.onicecandidate = function (ev) {
        if (ev && ev.candidate) {
          var c = ev.candidate;
          candidates.push({
            type: c.type,
            protocol: c.protocol,
            candidate: c.candidate
          });
        } else finishRtc();
      };
      try {
        if (typeof pc.createDataChannel === "function") pc.createDataChannel("x");
        var offer = pc.createOffer();
        if (offer && typeof offer.then === "function") {
          offer.then(function (o) {
            return pc.setLocalDescription(o);
          }).catch(function (e) {
            if (isDenied(e)) resolve(permission(id, title, { code: code }));
            else resolve(blocked(id, title, { code: code, intervention: String(e.message || e) }));
          });
        } else if (typeof pc.createOffer === "function") {
          pc.createOffer(
            function (o) {
              pc.setLocalDescription(o);
            },
            function (e) {
              resolve(blocked(id, title, { code: code, intervention: String(e && e.message) }));
            }
          );
        }
      } catch (e) {
        if (isDenied(e)) return resolve(permission(id, title, { code: code }));
        return resolve(blocked(id, title, { code: code, intervention: String(e.message || e) }));
      }
      setTimeout(finishRtc, 1500);
    });
  }

  function collectPointer(env) {
    var id = "pointer";
    var title = "Pointer / scroll";
    var code = "navigator.maxTouchPoints; matchMedia pointer/hover; scroll/pointer events";
    try {
      var n = nav(env);
      var w = win(env);
      if (n.maxTouchPoints == null && typeof w.matchMedia !== "function")
        return blocked(id, title, { code: code, intervention: "no pointer/touch hints" });
      var learned = {
        maxTouchPoints: n.maxTouchPoints,
        pointerFine: w.matchMedia ? w.matchMedia("(pointer: fine)").matches : null,
        pointerCoarse: w.matchMedia ? w.matchMedia("(pointer: coarse)").matches : null,
        hover: w.matchMedia ? w.matchMedia("(hover: hover)").matches : null,
        samples: 0
      };
      return finish({
        id: id,
        title: title,
        status: "Observed",
        codeExecuted: code,
        learned: json(learned),
        learnedValue: learned,
        stability: "gesture changes",
        intervention: "touch real",
        tracking: "behavior",
        sideEffects: "listen",
        network: "0 B"
      });
    } catch (e) {
      return blocked(id, title, { code: code, intervention: String(e.message || e) });
    }
  }

  function summarizePointerEvents(events) {
    events = events || [];
    var dx = [];
    var dy = [];
    var pressures = [];
    var deltas = [];
    var types = {};
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      types[e.type] = (types[e.type] || 0) + 1;
      if (e.dx != null) dx.push(Math.abs(e.dx));
      if (e.dy != null) dy.push(Math.abs(e.dy));
      if (e.pressure != null) pressures.push(e.pressure);
      if (e.deltaY != null) deltas.push(e.deltaY);
    }
    function min(a) {
      return a.length ? Math.min.apply(null, a) : null;
    }
    return {
      count: events.length,
      types: types,
      minAbsDx: min(dx),
      minAbsDy: min(dy),
      pressureUsed: pressures.some(function (p) {
        return p > 0 && p < 1;
      }),
      scrollSamples: deltas.length
    };
  }

  var COLLECTORS = [
    { id: "canvas", run: collectCanvas },
    { id: "webgl", run: collectWebGL },
    { id: "screen", run: collectScreen },
    { id: "hardware", run: collectHardware },
    { id: "fonts", run: collectFonts },
    { id: "css", run: collectCss },
    { id: "webaudio", run: collectWebAudio },
    { id: "webrtc", run: collectWebRTC },
    { id: "pointer", run: collectPointer }
  ];

  function collectorIds() {
    return COLLECTORS.map(function (c) {
      return c.id;
    });
  }

  function runCollector(id, env) {
    for (var i = 0; i < COLLECTORS.length; i++) {
      if (COLLECTORS[i].id === id) return Promise.resolve(COLLECTORS[i].run(env));
    }
    return Promise.resolve(blocked(id, id, { intervention: "unknown collector" }));
  }

  function collectAll(env) {
    var chain = Promise.resolve([]);
    COLLECTORS.forEach(function (c) {
      chain = chain.then(function (acc) {
        return Promise.resolve(c.run(env)).then(function (r) {
          acc.push(r);
          return acc;
        });
      });
    });
    return chain;
  }

  function flattenLearned(result) {
    var out = {};
    if (!result) return out;
    if (result.status === "Blocked" || result.status === "Permission required") {
      out[result.id] = null;
      return out;
    }
    var v = result.learnedValue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.keys(v).forEach(function (k) {
        if (k === "raw") return;
        out[result.id + "." + k] = v[k];
      });
    } else {
      out[result.id] = v != null ? v : result.learned;
    }
    return out;
  }

  function snapshotFromResults(results) {
    var fields = {};
    var randomized = [];
    (results || []).forEach(function (r) {
      var flat = flattenLearned(r);
      Object.keys(flat).forEach(function (k) {
        fields[k] = flat[k];
      });
      if (r.status === "Randomized") randomized.push(r.id);
    });
    return { ts: Date.now(), fields: fields, randomized: randomized };
  }

  function encodeSnapshot(snap) {
    return json(snap);
  }

  function parseSnapshot(text) {
    var o = JSON.parse(text);
    if (!o || typeof o !== "object" || !o.fields || typeof o.fields !== "object")
      throw new Error("bad snapshot");
    o.randomized = o.randomized || [];
    return o;
  }

  function same(a, b) {
    return json(a) === json(b);
  }

  function diffSnapshots(a, b) {
    a = a || { fields: {}, randomized: [] };
    b = b || { fields: {}, randomized: [] };
    var keys = {};
    Object.keys(a.fields || {}).forEach(function (k) {
      keys[k] = 1;
    });
    Object.keys(b.fields || {}).forEach(function (k) {
      keys[k] = 1;
    });
    var rows = [];
    Object.keys(keys).forEach(function (k) {
      var va = a.fields[k];
      var vb = b.fields[k];
      var root = k.split(".")[0];
      var marked =
        (a.randomized && a.randomized.indexOf(root) >= 0) ||
        (b.randomized && b.randomized.indexOf(root) >= 0);
      var state;
      if (va == null || vb == null) state = "unavailable";
      else if (marked && !same(va, vb)) state = "randomized";
      else if (same(va, vb)) state = "unchanged";
      else state = "changed";
      rows.push({ field: k, state: state, a: va, b: vb });
    });
    rows.sort(function (x, y) {
      return x.field < y.field ? -1 : 1;
    });
    return rows;
  }

  function pairForCompare(captured, pasteText, currentResults) {
    var imported = null;
    try {
      if (pasteText) imported = parseSnapshot(pasteText);
    } catch (e) {
      imported = null;
    }
    var fresh = snapshotFromResults(currentResults || []);
    var pasteIsEcho =
      captured &&
      imported &&
      same(captured.fields, imported.fields) &&
      same(captured.randomized || [], imported.randomized || []);
    return {
      a: captured || null,
      b: imported && !pasteIsEcho ? imported : fresh
    };
  }

  function randomId() {
    var s = "";
    for (var i = 0; i < 16; i++) s += ((Math.random() * 16) | 0).toString(16);
    return s;
  }

  function networkPayload(opts) {
    opts = opts || {};
    if (!opts.optIn) {
      return { sent: false, payload: null, bytes: 0, experimentId: null, ttlSeconds: null };
    }
    var payload = {
      experimentId: randomId(),
      ttlSeconds: 600,
      note: "preview only — this page has no server",
      results: opts.results || []
    };
    var text = json(payload);
    return {
      sent: false,
      payload: payload,
      bytes: text.length,
      experimentId: payload.experimentId,
      ttlSeconds: 600
    };
  }

  function createProcessor(ctx) {
    if (typeof ctx.createScriptProcessor === "function")
      return ctx.createScriptProcessor(4096, 1, 1);
    if (typeof ctx.createJavaScriptNode === "function")
      return ctx.createJavaScriptNode(4096, 1, 1);
    var g = ctx.createGain();
    g._role = "processor";
    return g;
  }

  function buildAliExpressGraph(ctx) {
    if (!ctx) throw new Error("AudioContext required");
    var osc = ctx.createOscillator();
    var analyser = ctx.createAnalyser();
    var processor = createProcessor(ctx);
    var gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(analyser);
    analyser.connect(processor);
    processor.connect(gain);
    gain.connect(ctx.destination);
    return {
      oscillator: osc,
      analyser: analyser,
      processor: processor,
      gain: gain,
      destination: ctx.destination,
      topology: ALIEXPRESS_GRAPH,
      connections: ALIEXPRESS_CONNECTIONS,
      audible: false,
      gainValue: 0
    };
  }

  function getAliExpressState() {
    return {
      started: aliState.started,
      autoStart: ALIEXPRESS_AUTO_START,
      audible: false,
      graph: aliState.graph
        ? {
            topology: aliState.graph.topology,
            connections: aliState.graph.connections,
            gainValue: aliState.graph.gainValue,
            ctxState: aliState.ctx && aliState.ctx.state,
            connectedToDestination: true
          }
        : null
    };
  }

  function startAliExpress(env) {
    if (ALIEXPRESS_AUTO_START) throw new Error("auto-start is forbidden");
    if (aliState.started) return Promise.resolve(getAliExpressState());
    var AC = env.AudioContext || env.webkitAudioContext;
    if (!AC) {
      return Promise.resolve(
        blocked("aliexpress", "AliExpress graph", {
          code: "oscillator→analyser→processor→gain=0→destination",
          intervention: "no AudioContext"
        })
      );
    }
    try {
      var ctx = new AC();
      var resume = ctx.resume ? ctx.resume() : Promise.resolve();
      return Promise.resolve(resume).then(function () {
        var graph = buildAliExpressGraph(ctx);
        if (graph.oscillator.start) graph.oscillator.start();
        aliState = { started: true, ctx: ctx, graph: graph };
        var coarse = ctx.sampleRate === 44100 || ctx.sampleRate === 48000;
        return finish({
          id: "aliexpress",
          title: "AliExpress graph",
          status: "Observed",
          codeExecuted: "oscillator → analyser → processor → gain=0 → destination",
          learned: json({
            audible: false,
            ctxState: ctx.state,
            connectedToDestination: true,
            sampleRate: ctx.sampleRate,
            gain: 0
          }),
          learnedValue: {
            audible: false,
            ctxState: ctx.state,
            connectedToDestination: true,
            sampleRate: ctx.sampleRate,
            gain: 0
          },
          stability: "until Stop",
          intervention: coarse ? "rate bucketed" : "rate odd",
          tracking: "weak",
          sideEffects: "may wake BT",
          network: "0 B"
        });
      });
    } catch (e) {
      if (isDenied(e))
        return Promise.resolve(
          permission("aliexpress", "AliExpress graph", {
            code: "oscillator→analyser→processor→gain=0→destination"
          })
        );
      return Promise.resolve(
        blocked("aliexpress", "AliExpress graph", { intervention: String(e.message || e) })
      );
    }
  }

  function stopAliExpress() {
    try {
      if (aliState.graph && aliState.graph.oscillator && aliState.graph.oscillator.stop)
        aliState.graph.oscillator.stop();
      if (aliState.ctx && aliState.ctx.close) aliState.ctx.close();
    } catch (e) {}
    aliState = { started: false, ctx: null, graph: null };
    return getAliExpressState();
  }

  function resetAliExpressForTests() {
    aliState = { started: false, ctx: null, graph: null };
  }

  var PROTECTION = [
    { mode: "real", note: "device value" },
    { mode: "bucketed", note: "rounded set" },
    { mode: "randomized", note: "noise / farbling" },
    { mode: "origin-partitioned", note: "origin-scoped" },
    { mode: "permission", note: "needs a grant" },
    { mode: "blocked", note: "missing / refused" }
  ];

  global.FP = {
    STATUSES: STATUSES,
    DETAIL_FIELDS: DETAIL_FIELDS,
    DETAIL_LABELS: DETAIL_LABELS,
    MEMORY_BUCKETS: MEMORY_BUCKETS,
    ALIEXPRESS_GRAPH: ALIEXPRESS_GRAPH,
    ALIEXPRESS_CONNECTIONS: ALIEXPRESS_CONNECTIONS,
    ALIEXPRESS_AUTO_START: ALIEXPRESS_AUTO_START,
    PROTECTION: PROTECTION,
    summarize: summarize,
    uaFamily: uaFamily,
    collectCanvas: collectCanvas,
    collectWebGL: collectWebGL,
    collectScreen: collectScreen,
    collectHardware: collectHardware,
    collectFonts: collectFonts,
    collectCss: collectCss,
    collectWebAudio: collectWebAudio,
    collectWebRTC: collectWebRTC,
    collectPointer: collectPointer,
    summarizePointerEvents: summarizePointerEvents,
    collectorIds: collectorIds,
    runCollector: runCollector,
    collectAll: collectAll,
    flattenLearned: flattenLearned,
    snapshotFromResults: snapshotFromResults,
    encodeSnapshot: encodeSnapshot,
    parseSnapshot: parseSnapshot,
    diffSnapshots: diffSnapshots,
    pairForCompare: pairForCompare,
    networkPayload: networkPayload,
    buildAliExpressGraph: buildAliExpressGraph,
    startAliExpress: startAliExpress,
    stopAliExpress: stopAliExpress,
    getAliExpressState: getAliExpressState,
    resetAliExpressForTests: resetAliExpressForTests
  };
})(typeof window !== "undefined" ? window : globalThis);
