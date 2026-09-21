"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var failed = 0;
var passed = 0;

function load(file, extra) {
  var code = fs.readFileSync(path.join(__dirname, file), "utf8");
  var window = extra && extra.window ? extra.window : {};
  if (!window.document) {
    window.document = {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () {
        return null;
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      createElement: function () {
        return {};
      }
    };
  }
  window.location = window.location || { protocol: "https:", pathname: "/observe-lab/" };
  window.navigator = window.navigator || { userAgent: "test" };
  window.screen = window.screen || { width: 1920, height: 1080 };
  window.console = console;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  var ctx = Object.assign(
    {
      window: window,
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      globalThis: window
    },
    extra || {}
  );
  ctx.window = window;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      passed++;
      console.log("ok  " + name);
    })
    .catch(function (e) {
      failed++;
      console.log("FAIL  " + name);
      console.log("  " + (e && e.stack ? e.stack : e));
    });
}

function hasDetails(r) {
  var FP = load("core.js").window.FP;
  assert.ok(r, "result");
  FP.DETAIL_FIELDS.forEach(function (k) {
    assert.ok(k in r, "missing field " + k);
    assert.ok(r[k] !== undefined, "undefined " + k);
  });
  assert.ok(FP.STATUSES.indexOf(r.status) >= 0, "status " + r.status);
}

function emptyEnv() {
  return { window: {}, document: null, navigator: {}, screen: null };
}

function canvasEnv(opts) {
  opts = opts || {};
  var draws = 0;
  return {
    document: {
      createElement: function (tag) {
        if (tag !== "canvas") return {};
        return {
          width: 0,
          height: 0,
          getContext: function (type) {
            if (opts.no2d && type === "2d") return null;
            if (opts.noWebgl && (type === "webgl" || type === "experimental-webgl")) return null;
            if (type === "webgl" || type === "experimental-webgl") {
              var ext = opts.noDebug
                ? null
                : { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
              return {
                VENDOR: 0x1f00,
                RENDERER: 0x1f01,
                getParameter: function (p) {
                  if (p === 0x1f00) return "WebKit";
                  if (p === 0x1f01) return "WebKit WebGL";
                  if (p === 0x9245) return "GPU Vendor";
                  if (p === 0x9246) return "GPU Renderer";
                  return null;
                },
                getExtension: function () {
                  return ext;
                }
              };
            }
            return {
              textBaseline: "",
              font: "",
              fillStyle: "",
              fillRect: function () {},
              fillText: function () {},
              measureText: function (t) {
                var extra = 0;
                if (/Arial/.test(this.font)) extra = 3;
                if (/Comic/.test(this.font)) extra = 5;
                return { width: t.length * 7 + extra };
              }
            };
          },
          toDataURL: function () {
            draws++;
            if (opts.throwData) throw new Error("tainted");
            if (opts.random) return "data:image/png;base64," + draws + Math.random();
            return "data:image/png;base64,AAA";
          }
        };
      }
    },
    navigator: {},
    window: {}
  };
}

function mockAC(opts) {
  opts = opts || {};
  function Node(type) {
    this.type = type;
    this.connectedTo = [];
    this.gain = { value: 1 };
    this.frequency = { value: 440 };
    this.onaudioprocess = null;
  }
  Node.prototype.connect = function (dest) {
    this.connectedTo.push(dest);
    return dest;
  };
  Node.prototype.start = function () {
    this.started = true;
  };
  Node.prototype.stop = function () {
    this.started = false;
  };
  function AC() {
    if (opts.deny) {
      var e = new Error("denied");
      e.name = "NotAllowedError";
      throw e;
    }
    this.state = "running";
    this.sampleRate = opts.sampleRate || 48000;
    this.baseLatency = 0.01;
    this.outputLatency = 0.02;
    this.destination = new Node("destination");
    this.destination.maxChannelCount = 2;
  }
  AC.prototype.createOscillator = function () {
    return new Node("oscillator");
  };
  AC.prototype.createAnalyser = function () {
    return new Node("analyser");
  };
  AC.prototype.createScriptProcessor = function () {
    return new Node("processor");
  };
  AC.prototype.createGain = function () {
    return new Node("gain");
  };
  AC.prototype.resume = function () {
    return Promise.resolve();
  };
  AC.prototype.close = function () {
    this.state = "closed";
  };
  return AC;
}

function mockRTC(opts) {
  opts = opts || {};
  function RTC() {
    if (opts.deny) {
      var e = new Error("denied");
      e.name = "NotAllowedError";
      throw e;
    }
    this.onicecandidate = null;
  }
  RTC.prototype.createDataChannel = function () {
    return {};
  };
  RTC.prototype.createOffer = function () {
    return Promise.resolve({ type: "offer", sdp: "v=0" });
  };
  RTC.prototype.setLocalDescription = function () {
    var self = this;
    return Promise.resolve().then(function () {
      if (self.onicecandidate) {
        self.onicecandidate({
          candidate: { candidate: "candidate:0 1 UDP 1 typ host", type: "host", protocol: "udp" }
        });
        self.onicecandidate({ candidate: null });
      }
    });
  };
  RTC.prototype.close = function () {};
  return RTC;
}

async function main() {
  await test("scripts have no unguarded require/module", function () {
    ["core.js", "app.js"].forEach(function (f) {
      var src = fs.readFileSync(path.join(__dirname, f), "utf8");
      src.split(/\n/).forEach(function (line, i) {
        if (/^\s*require\s*\(/.test(line)) throw new Error(f + ":" + (i + 1) + " unguarded require");
        if (/^\s*module\.exports/.test(line)) throw new Error(f + ":" + (i + 1) + " unguarded module.exports");
      });
    });
  });

  await test("core.js installs window.FP in a browser-like env", function () {
    var ctx = load("core.js");
    assert.ok(ctx.window.FP, "FP missing");
    assert.strictEqual(ctx.window.FP.ALIEXPRESS_AUTO_START, false);
    assert.strictEqual(
      ctx.window.FP.ALIEXPRESS_GRAPH.map(function (n) {
        return n.type;
      }).join(","),
      "oscillator,analyser,processor,gain,destination"
    );
    assert.strictEqual(ctx.window.FP.ALIEXPRESS_GRAPH[3].gain, 0);
  });

  await test("app.js loads with window defined and does not throw", function () {
    var core = load("core.js");
    var calls = [];
    var fakeEl = function () {
      return {
        innerHTML: "",
        textContent: "",
        hidden: true,
        disabled: false,
        value: "",
        addEventListener: function (ev, fn) {
          calls.push(ev);
        },
        classList: { toggle: function () {} }
      };
    };
    var window = core.window;
    window.FP = core.window.FP;
    window.document = {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: fakeEl,
      querySelector: fakeEl,
      querySelectorAll: function () {
        return [];
      },
      createElement: function () {
        return {};
      }
    };
    window.addEventListener = function () {};
    window.location = { protocol: "https:", pathname: "/observe-lab/" };
    window.navigator = { userAgent: "Mozilla/5.0 Chrome/120", hardwareConcurrency: 8, deviceMemory: 8 };
    window.screen = { width: 1920, height: 1080 };
    window.devicePixelRatio = 2;
    window.innerWidth = 1200;
    window.innerHeight = 800;
    var ctx = {
      window: window,
      document: window.document,
      navigator: window.navigator,
      screen: window.screen,
      console: console,
      location: window.location,
      FP: window.FP,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), ctx);
  });

  await test("status taxonomy exact strings, no score field", function () {
    var FP = load("core.js").window.FP;
    assert.strictEqual(
      [].slice.call(FP.STATUSES).join("|"),
      "Observed|Inferred|Randomized|Blocked|Permission required|Sent"
    );
    assert.strictEqual(
      [].slice.call(FP.DETAIL_FIELDS).join("|"),
      "codeExecuted|learned|stability|intervention|tracking|sideEffects|network"
    );
    assert.strictEqual(FP.DETAIL_LABELS.codeExecuted, "API");
    assert.strictEqual(FP.DETAIL_LABELS.learned, "Got");
    assert.strictEqual(FP.DETAIL_LABELS.stability, "");
    assert.strictEqual(FP.DETAIL_LABELS.intervention, "Protect");
    assert.strictEqual(FP.DETAIL_LABELS.tracking, "Use");
    assert.strictEqual(FP.DETAIL_LABELS.sideEffects, "Cost");
    assert.strictEqual(FP.DETAIL_LABELS.network, "Net");
    assert.ok(FP.DETAIL_FIELDS.indexOf("stability") >= 0);
    var visible = FP.DETAIL_FIELDS.map(function (k) {
      return FP.DETAIL_LABELS[k];
    }).filter(Boolean);
    visible.forEach(function (l) {
      assert.ok(l.split(/\s+/).length <= 2, l);
      assert.notStrictEqual(l, "Stability");
    });
    var r = FP.collectHardware({ navigator: { hardwareConcurrency: 8, deviceMemory: 4 } });
    var html = visible
      .map(function (l) {
        return l;
      })
      .join("|");
    assert.ok(html.indexOf("API") >= 0);
    assert.ok(r.stability);
  });

  await test("HTML has landing, list, seven labels, relative assets, no score copy", function () {
    var html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    assert.ok(html.indexOf('id="summary"') >= 0);
    assert.ok(html.indexOf('id="list"') >= 0);
    assert.ok(html.indexOf("detail") >= 0);
    ["href=\"./app.css\"", "src=\"./core.js\"", "src=\"./app.js\""].forEach(function (s) {
      assert.ok(html.indexOf(s) >= 0, s);
    });
    assert.ok(!/href="\//.test(html), "root-absolute href");
    assert.ok(!/src="\//.test(html), "root-absolute src");
    assert.ok(!/87\s*\/\s*100/.test(html));
    assert.ok(!/trackable/i.test(html));
    assert.ok(!/you are unique/i.test(html));
    assert.ok(html.indexOf("Start") >= 0);
    assert.ok(html.indexOf("oscillator") >= 0);
    var css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
    assert.ok(!/#cc8800/i.test(css));
    assert.ok(!/#c55221/i.test(css));
    assert.ok(!/#f4e6d4/i.test(css));
    assert.ok(!/Chakra Petch/.test(css));
    assert.ok(!/JetBrains Mono/.test(css));
    assert.ok(/--lamp:\s*#0a4f4c/i.test(css));
    assert.ok(/--bench:\s*#c5d4dc/i.test(css));
    assert.ok(/Sora/.test(css));
    assert.ok(/IBM Plex Mono/.test(css));
  });

  await test("default network payload is empty and not sent", function () {
    var FP = load("core.js").window.FP;
    var p = FP.networkPayload();
    assert.strictEqual(p.sent, false);
    assert.strictEqual(p.payload, null);
    assert.strictEqual(p.bytes, 0);
    var q = FP.networkPayload({ optIn: true, results: [{ id: "canvas", status: "Observed" }] });
    assert.strictEqual(q.sent, false);
    assert.ok(q.payload);
    assert.ok(q.experimentId);
    assert.strictEqual(q.ttlSeconds, 600);
    assert.ok(q.bytes > 0);
  });

  await test("snapshot diff: unchanged / changed / randomized / unavailable", function () {
    var FP = load("core.js").window.FP;
    var a = {
      fields: { "canvas.digest": "aaa", "screen.width": 1920, "fonts.present": ["Arial"] },
      randomized: []
    };
    var b = {
      fields: { "canvas.digest": "bbb", "screen.width": 1920, "webrtc.count": 1 },
      randomized: ["canvas"]
    };
    var rows = FP.diffSnapshots(a, b);
    var map = {};
    rows.forEach(function (r) {
      map[r.field] = r.state;
    });
    assert.strictEqual(map["screen.width"], "unchanged");
    assert.strictEqual(map["canvas.digest"], "randomized");
    assert.strictEqual(map["fonts.present"], "unavailable");
    assert.strictEqual(map["webrtc.count"], "unavailable");
    var changed = FP.diffSnapshots(
      { fields: { "hardware.cores": 8 }, randomized: [] },
      { fields: { "hardware.cores": 4 }, randomized: [] }
    );
    assert.strictEqual(changed[0].state, "changed");
  });

  await test("Capture then resize Screen Compare marks viewport changed even if paste echoes capture", function () {
    var FP = load("core.js").window.FP;
    function screenEnv(w, h) {
      return {
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
        window: { devicePixelRatio: 2, innerWidth: w, innerHeight: h }
      };
    }
    var before = FP.collectScreen(screenEnv(1280, 720));
    var captured = FP.snapshotFromResults([before]);
    var pasteEcho = FP.encodeSnapshot(captured);
    var after = FP.collectScreen(screenEnv(800, 600));
    var pair = FP.pairForCompare(captured, pasteEcho, [after]);
    assert.ok(pair.a && pair.b, "pair");
    var rows = FP.diffSnapshots(pair.a, pair.b);
    var vw = rows.filter(function (r) {
      return r.field === "screen.innerWidth";
    })[0];
    var vh = rows.filter(function (r) {
      return r.field === "screen.innerHeight";
    })[0];
    assert.ok(vw, "innerWidth row");
    assert.strictEqual(vw.state, "changed");
    assert.strictEqual(vw.a, 1280);
    assert.strictEqual(vw.b, 800);
    assert.ok(vh);
    assert.strictEqual(vh.state, "changed");
  });

  await test("pairForCompare uses imported paste when it differs from capture", function () {
    var FP = load("core.js").window.FP;
    function screenEnv(w, h) {
      return {
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
        window: { devicePixelRatio: 2, innerWidth: w, innerHeight: h }
      };
    }
    var captured = FP.snapshotFromResults([FP.collectScreen(screenEnv(1280, 720))]);
    var imported = FP.snapshotFromResults([FP.collectScreen(screenEnv(1024, 768))]);
    var live = FP.collectScreen(screenEnv(800, 600));
    var pair = FP.pairForCompare(captured, FP.encodeSnapshot(imported), [live]);
    assert.strictEqual(pair.b.fields["screen.innerWidth"], 1024);
  });

  await test("PROTECTION includes origin-partitioned and app.js renders it", function () {
    var FP = load("core.js").window.FP;
    var modes = [];
    for (var i = 0; i < FP.PROTECTION.length; i++) modes.push(FP.PROTECTION[i].mode);
    assert.ok(modes.indexOf("origin-partitioned") >= 0);
    ["real", "bucketed", "randomized", "origin-partitioned", "permission", "blocked"].forEach(function (m) {
      assert.ok(modes.indexOf(m) >= 0, m);
    });
    var html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    assert.ok(html.indexOf('id="modes"') >= 0);
    var els = {};
    function el() {
      return {
        innerHTML: "",
        textContent: "",
        hidden: true,
        disabled: false,
        value: "",
        addEventListener: function () {},
        classList: { toggle: function () {} }
      };
    }
    var core = load("core.js");
    var window = core.window;
    window.FP = core.window.FP;
    window.document = {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function (id) {
        if (!els[id]) els[id] = el();
        return els[id];
      },
      querySelector: function () {
        return el();
      },
      querySelectorAll: function () {
        return [];
      },
      createElement: function () {
        return {};
      }
    };
    window.addEventListener = function () {};
    window.location = { protocol: "https:", pathname: "/observe-lab/" };
    window.navigator = { userAgent: "Chrome/120", hardwareConcurrency: 8, deviceMemory: 8 };
    window.screen = { width: 1920, height: 1080 };
    window.devicePixelRatio = 2;
    window.innerWidth = 1200;
    window.innerHeight = 800;
    var ctx = {
      window: window,
      document: window.document,
      navigator: window.navigator,
      screen: window.screen,
      console: console,
      location: window.location,
      FP: window.FP,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), ctx);
    assert.ok(els.modes, "modes el");
    assert.ok(els.modes.innerHTML.indexOf("origin-partitioned") >= 0, els.modes.innerHTML);
    assert.ok(els.modes.innerHTML.indexOf("bucketed") >= 0);
    assert.ok(els.legend.innerHTML.indexOf("Observed") >= 0);
  });

  await test("AliExpress topology + no auto-start + gain 0 + destination", function () {
    var ctx = load("core.js");
    var FP = ctx.window.FP;
    assert.strictEqual(FP.ALIEXPRESS_AUTO_START, false);
    assert.strictEqual(FP.getAliExpressState().started, false);
    assert.strictEqual(FP.getAliExpressState().graph, null);
    var AC = mockAC();
    var ac = new AC();
    var g = FP.buildAliExpressGraph(ac);
    assert.strictEqual(g.oscillator.connectedTo[0], g.analyser);
    assert.strictEqual(g.analyser.connectedTo[0], g.processor);
    assert.strictEqual(g.processor.connectedTo[0], g.gain);
    assert.strictEqual(g.gain.connectedTo[0], g.destination);
    assert.strictEqual(g.gain.gain.value, 0);
    assert.strictEqual(g.audible, false);
    assert.deepStrictEqual(g.connections, FP.ALIEXPRESS_CONNECTIONS);
  });

  await test("startAliExpress is Start-only and records silent live graph", function () {
    var FP = load("core.js").window.FP;
    FP.resetAliExpressForTests();
    assert.strictEqual(FP.getAliExpressState().started, false);
    return FP.startAliExpress({ AudioContext: mockAC() }).then(function (rec) {
      hasDetails(rec);
      assert.strictEqual(rec.id, "aliexpress");
      assert.strictEqual(rec.learnedValue.audible, false);
      assert.strictEqual(rec.learnedValue.connectedToDestination, true);
      assert.strictEqual(rec.learnedValue.gain, 0);
      assert.ok(FP.getAliExpressState().started);
      assert.ok(/weak/i.test(rec.tracking));
      FP.resetAliExpressForTests();
    });
  });

  var ids = ["canvas", "webgl", "screen", "hardware", "fonts", "css", "webaudio", "webrtc", "pointer"];

  await test("each MVP collector is blocked when APIs are missing", function () {
    var FP = load("core.js").window.FP;
    var env = emptyEnv();
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        return FP.runCollector(id, env).then(function (r) {
          hasDetails(r);
          assert.ok(
            r.status === "Blocked" || r.status === "Permission required",
            id + " status " + r.status
          );
          assert.ok(r.learnedValue == null || r.learned === "unavailable" || r.learned === "not read");
        });
      });
    });
    return chain;
  });

  await test("collectors return seven detail fields on success paths", function () {
    var FP = load("core.js").window.FP;
    var cenv = canvasEnv();
    cenv.navigator = { hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, userAgent: "Chrome/120" };
    cenv.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 };
    cenv.window = {
      devicePixelRatio: 2,
      innerWidth: 1280,
      innerHeight: 720,
      matchMedia: function (q) {
        return { matches: q.indexOf("hover: hover") >= 0 };
      }
    };
    cenv.AudioContext = mockAC();
    cenv.RTCPeerConnection = mockRTC();
    var map = {
      canvas: cenv,
      webgl: cenv,
      screen: cenv,
      hardware: cenv,
      fonts: cenv,
      css: cenv,
      webaudio: cenv,
      webrtc: cenv,
      pointer: cenv
    };
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        return FP.runCollector(id, map[id]).then(function (r) {
          hasDetails(r);
          assert.strictEqual(r.id, id);
          assert.ok(r.status === "Observed" || r.status === "Randomized" || r.status === "Inferred");
          assert.ok(r.codeExecuted);
          assert.ok(r.network);
          assert.ok(String(r.network).length <= 8);
          ["stability", "intervention", "tracking", "sideEffects", "network"].forEach(function (k) {
            assert.ok(String(r[k]).split(/\s+/).length <= 5, id + " " + k + " " + r[k]);
          });
        });
      });
    });
    return chain;
  });

  await test("canvas two-draw mismatch is Randomized, not a fake digest", function () {
    var FP = load("core.js").window.FP;
    var r = FP.collectCanvas(canvasEnv({ random: true }));
    hasDetails(r);
    assert.strictEqual(r.status, "Randomized");
    assert.ok(r.learnedValue.digest);
    var stable = FP.collectCanvas(canvasEnv());
    assert.strictEqual(stable.status, "Observed");
    assert.ok(stable.learnedValue.digest);
    assert.notStrictEqual(stable.learnedValue.digest, r.learnedValue.digest);
  });

  await test("NotAllowedError becomes Permission required", function () {
    var FP = load("core.js").window.FP;
    var r = FP.collectWebAudio({ AudioContext: mockAC({ deny: true }) });
    hasDetails(r);
    assert.strictEqual(r.status, "Permission required");
    return FP.collectWebRTC({ RTCPeerConnection: mockRTC({ deny: true }) }).then(function (w) {
      hasDetails(w);
      assert.strictEqual(w.status, "Permission required");
    });
  });

  await test("hardware notes Chrome memory buckets without claiming uniqueness", function () {
    var FP = load("core.js").window.FP;
    var r = FP.collectHardware({ navigator: { hardwareConcurrency: 8, deviceMemory: 8 } });
    hasDetails(r);
    assert.strictEqual(r.learnedValue.deviceMemory, 8);
    assert.ok(/bucket/i.test(r.intervention));
    assert.ok(!/unique/i.test(r.tracking));
    assert.ok(r.intervention.split(/\s+/).length <= 3);
  });

  await test("snapshotFromResults marks blocked fields unavailable in diff", function () {
    var FP = load("core.js").window.FP;
    var blocked = FP.collectCanvas(emptyEnv());
    var ok = FP.collectHardware({ navigator: { hardwareConcurrency: 4, deviceMemory: 4 } });
    var snap = FP.snapshotFromResults([blocked, ok]);
    assert.strictEqual(snap.fields.canvas, null);
    assert.strictEqual(snap.fields["hardware.hardwareConcurrency"], 4);
    var other = FP.snapshotFromResults([ok]);
    var rows = FP.diffSnapshots(snap, other);
    var canvasRow = rows.filter(function (x) {
      return x.field === "canvas";
    })[0];
    assert.ok(canvasRow);
    assert.strictEqual(canvasRow.state, "unavailable");
  });

  await test("pointer event summarizer uses supplied samples", function () {
    var FP = load("core.js").window.FP;
    var s = FP.summarizePointerEvents([
      { type: "pointer", dx: 1, dy: 0, pressure: 0.4 },
      { type: "scroll", deltaY: 40 }
    ]);
    assert.strictEqual(s.count, 2);
    assert.strictEqual(s.minAbsDx, 1);
    assert.strictEqual(s.pressureUsed, true);
    assert.strictEqual(s.scrollSamples, 1);
  });

  await test("relative Pages subpath: CSS font urls are relative", function () {
    var css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
    assert.ok(css.indexOf('url("./fonts/') >= 0);
    assert.ok(css.indexOf("url(/") === -1);
    assert.ok(fs.existsSync(path.join(__dirname, ".nojekyll")));
    assert.ok(fs.existsSync(path.join(__dirname, "fonts", "sora-400.woff2")));
    assert.ok(fs.existsSync(path.join(__dirname, "fonts", "ibm-plex-mono-400.woff2")));
    assert.ok(!fs.existsSync(path.join(__dirname, "fonts", "chakra-petch-400.woff2")));
  });

  await test("shipped assets drop impeccable tokens", function () {
    ["app.css", "index.html", "app.js", "core.js", "favicon.svg"].forEach(function (f) {
      var src = fs.readFileSync(path.join(__dirname, f), "utf8");
      ["#CC8800", "#cc8800", "#C55221", "#c55221", "#F4E6D4", "#f4e6d4", "Chakra Petch", "JetBrains Mono"].forEach(function (tok) {
        assert.ok(src.indexOf(tok) === -1, f + " has " + tok);
      });
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed) process.exit(1);
}

main();
