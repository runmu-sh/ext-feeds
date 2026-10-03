// src/index.ts
import { defineExtension } from "@muclient/sdk";

// src/panel.ts
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";

// src/model.ts
var COPY = {
  /** The Rules tool's tooltip. */
  rulesTip: "Open Settings \u2192 Feeds to edit what goes where",
  search: "Search",
  times: "Times",
  rules: "Rules",
  popOut: "Pop out",
  clear: "Clear",
  help: "Help",
  addFeed: "Add a feed",
  empty: "Empty.",
  noMatches: "No matches.",
  title: "Feeds",
  feedTitle: "Feed",
  /** The popped-out feed's tab. */
  popTitle: (label) => `Feed: ${label}`,
  confirmClear: (label) => `Clear ${label}?`,
  confirmClearBody: (label, n) => `${n} line${n === 1 ? "" : "s"} in \u201C${label}\u201D ${n === 1 ? "goes" : "go"} away on this device. The rule keeps filling it.`,
  searchIn: (label) => `Search ${label}`,
  latest: (n) => `${n} new line${n === 1 ? "" : "s"} \u2193`,
  jumpLatest: "Jump to the latest line",
  /** The empty panel: what a feed is and how to get one. */
  introHead: "No feeds yet",
  introText: "A feed is a side channel of the terminal. A rule in Settings \u2192 Feeds watches the game's output for some text or a regular expression and copies or moves each matching line into a feed of your choosing. Every feed gets a tab here.",
  introSteps: ["Open Settings \u2192 Feeds, the \u21F6 Feeds tile (or press Add a feed).", "Add a rule: what to match, and the feed it goes to.", "Lines land here as the game sends them."],
  /** Under “Empty.” in a feed that has no lines yet. */
  emptyHint: (label) => `Lines your rules send to \u201C${label}\u201D will show up here.`,
  /** The help strip. */
  helpTitle: "About feeds",
  helpRows: [
    ["Search", "filter this feed; Esc closes"],
    ["Times", "show when each line arrived"],
    ["Pop out", "this feed in its own panel (or double-click its tab)"],
    ["Rules", "open Settings \u2192 Feeds, where the rules say what goes where"],
    ["Clear", "empty this feed on this device"]
  ],
  helpNote: "Feeds are kept per session, up to 500 lines each. A badge counts lines you have not seen; keyboard: \u2190 \u2192 Home End move between tabs, F6 reaches the lines.",
  tabTip: (label, n) => `${label} \xB7 ${n} line${n === 1 ? "" : "s"} \xB7 double-click to pop out`,
  lineCount: (n) => `${n} line${n === 1 ? "" : "s"}`
};
var ANSI = "mu-ansi";
var SCOPE = '.ext-panel[data-ext="feeds"]';
var FEEDS_CSS = [
  ".mu-feeds { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-elev); container-type: inline-size; }",
  // The bar: tabs left, tools right, wrapping onto two rows in a narrow dock.
  ".mu-feeds .fbar { display: flex; flex-wrap: wrap; align-items: center; column-gap: 6px; row-gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; }",
  ".mu-feeds .ftabs { display: flex; gap: 2px; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; }",
  ".mu-feeds .solo { flex: 1; min-width: 0; color: var(--accent-bright); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".mu-feeds .ftab { display: inline-flex; align-items: center; gap: .6ch; background: none; border: 0; border-radius: 0; color: var(--fg-dim); font-family: inherit; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 2px .8ch; min-height: 24px; max-width: 18ch; cursor: pointer; transition: color .12s ease, background-color .12s ease; }",
  ".mu-feeds .ftab .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".mu-feeds .ftab:hover { color: var(--fg); background: var(--tint-toggle); }",
  ".mu-feeds .ftab.on { color: var(--bg-deep); background: var(--accent); }",
  ".mu-feeds .ftab.unread:not(.on) { color: var(--fg); }",
  ".mu-feeds .tools { display: flex; flex-wrap: wrap; gap: 2px; flex: 0 1 auto; margin-left: auto; }",
  // Search strip and the help strip sit under the bar.
  ".mu-feeds .fsearch { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }",
  ".mu-feeds .fsearch input { flex: 1; min-width: 0; }",
  ".mu-feeds .cnt { color: var(--fg-dim); font-size: .72rem; white-space: nowrap; }",
  ".mu-feeds .fhelp { padding: 6px 10px 8px; border-bottom: 1px solid var(--border); background: var(--bg); color: var(--fg-dim); font-size: .74rem; line-height: 1.5; flex: 0 0 auto; }",
  ".mu-feeds .fhelp dl { display: grid; grid-template-columns: max-content 1fr; gap: 1px 1.2ch; margin: 0 0 4px; }",
  ".mu-feeds .fhelp dt { color: var(--accent-bright); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; align-self: baseline; padding-top: .15em; }",
  ".mu-feeds .fhelp dd { margin: 0; }",
  ".mu-feeds .fhelp p { margin: 0; color: var(--fg-faint); font-size: .7rem; }",
  // The lines.
  ".mu-feeds .lines-wrap { position: relative; flex: 1; min-height: 0; display: flex; }",
  ".mu-feeds .flines { flex: 1; overflow-y: auto; padding: 6px 10px; line-height: var(--shell-line-height, 1.5); outline-offset: -2px; }",
  ".mu-feeds .fline { white-space: pre-wrap; word-break: break-word; padding: 0 4px; margin: 0 -4px; transition: background-color .12s ease; }",
  ".mu-feeds .fline:hover { background: var(--tint-row); }",
  ".mu-feeds .ts { color: var(--fg-faint); margin-right: .8ch; font-size: .82em; user-select: none; }",
  ".mu-feeds .fempty { padding: 10px 0 2px; margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }",
  ".mu-feeds .fempty-hint { margin: 0; color: var(--fg-faint); font-size: .74rem; line-height: 1.5; }",
  ".mu-feeds .latest { position: absolute; right: 14px; bottom: 10px; z-index: 5; background: var(--accent); border: 0; border-radius: 0; color: var(--bg-deep); font-family: inherit; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 3px 10px; min-height: 24px; cursor: pointer; transition: background-color .12s ease; }",
  ".mu-feeds .latest.quiet { padding: 3px 7px; }",
  ".mu-feeds .latest:hover { background: var(--accent-bright); }",
  // The empty panel: an explanation and the way in, not a lone button.
  ".mu-feeds .intro { padding: 12px 14px; color: var(--fg-dim); font-size: .8rem; line-height: 1.5; max-width: 60ch; }",
  ".mu-feeds .intro .ihead { margin: 0 0 6px; color: var(--fg-faint); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }",
  ".mu-feeds .intro p { margin: 0 0 8px; }",
  ".mu-feeds .intro ol { margin: 0 0 10px; padding-left: 2.4ch; color: var(--fg-dim); }",
  ".mu-feeds .intro li { margin: 0 0 2px; }",
  ".mu-feeds .intro li::marker { color: var(--accent); }",
  ".mu-feeds .intro .make { margin-left: -.5ch; }",
  // A narrow dock: the tabs take the first row, the tools the second.
  "@container (max-width: 560px) { .mu-feeds .ftabs { flex-basis: 100%; } .mu-feeds .tools { margin-left: 0; } }",
  "@media (max-width: 420px) { .mu-feeds .ftab, .mu-feeds .latest { min-height: 32px; } }"
].map((r) => r.startsWith("@") ? r.replace(/\.mu-feeds/g, `${SCOPE} .mu-feeds`) : `${SCOPE} ${r}`).join("\n");
var soloOf = (params) => typeof params?.feed === "string" ? params.feed : "";
var labelsOf = (view, solo) => solo ? [solo] : view ? [...view.labels] : [];
var keepSelection = (labels, sel) => labels.includes(sel) ? sel : labels[0] ?? "";
function tabTarget(key, i, n) {
  if (n <= 0) return -1;
  switch (key) {
    case "ArrowRight":
      return (i + 1) % n;
    case "ArrowLeft":
      return (i - 1 + n) % n;
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return -1;
  }
}
function hhmmss(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function filterLines(lines, q) {
  const needle = q.trim().toLowerCase();
  return needle ? lines.filter((l) => l.text.toLowerCase().includes(needle)) : lines;
}
var unreadOf = (view, label, sel) => label !== sel ? view?.unread[label] ?? 0 : 0;
var tabLabel = (label, unread) => unread ? `${label}, ${unread} unread` : label;
var nearEnd = (b) => b.scrollHeight - b.scrollTop - b.clientHeight < 24;
var readingOf = (sel, atEnd) => sel && atEnd ? sel : null;
var newTail = () => ({ sel: "", lastId: -Infinity, atEnd: true, fresh: 0 });
function stepTail(t, sel, shown) {
  const lastId = shown.length ? shown[shown.length - 1].id : t.lastId;
  if (sel !== t.sel) return { sel, lastId, atEnd: true, fresh: 0 };
  if (t.atEnd) return { ...t, lastId, fresh: 0 };
  const added = shown.reduce((n, l) => n + (l.id > t.lastId ? 1 : 0), 0);
  return { ...t, lastId: Math.max(lastId, t.lastId), fresh: t.fresh + added };
}
var pillOf = (t) => t.atEnd ? null : t.fresh > 0 ? { quiet: false, text: COPY.latest(t.fresh) } : { quiet: true, text: "\u2193" };
function readers(viewing) {
  const per = /* @__PURE__ */ new Map();
  const settle = (sid, want) => {
    const s = per.get(sid);
    if (!s) return;
    let next = want ?? "";
    if (!next) {
      const held = [...s.by.values()].filter((l) => !!l);
      next = held.includes(s.cur) ? s.cur : held[held.length - 1] ?? "";
    }
    if (next !== s.cur || want && next) {
      s.cur = next;
      viewing(next || null, sid);
    }
  };
  return {
    set(sid, key, label) {
      const s = per.get(sid) ?? per.set(sid, { by: /* @__PURE__ */ new Map(), cur: "" }).get(sid);
      s.by.delete(key);
      s.by.set(key, label || null);
      settle(sid, label || null);
    },
    drop(sid, key) {
      const s = per.get(sid);
      if (s?.by.delete(key)) settle(sid, null);
    },
    forget(sid) {
      per.delete(sid);
    },
    current: (sid) => per.get(sid)?.cur ?? ""
  };
}
var hasLines = (view) => !!view && Object.values(view.lines).some((ls) => ls.length > 0);
function onFirstLine(mu, feeds, onFirst) {
  return mu.sessions.each((s) => {
    let done = false, off = null;
    const stop = () => {
      const d2 = off;
      off = null;
      d2?.();
    };
    const d = feeds.watch(s.id, (view) => {
      if (done || !hasLines(view)) return;
      done = true;
      onFirst(s.id);
      stop();
    });
    if (done) d();
    else off = d;
    return stop;
  });
}

// src/panel.ts
var panelSeq = 0;
function createPanel(mu, store, reading) {
  const c = mu.ui.css;
  return defineComponent({
    name: "FeedsPanel",
    props: { sid: { type: String, default: null }, worldId: { type: String, default: null }, params: { type: Object, default: () => ({}) } },
    setup(props) {
      const key = `p${++panelSeq}`;
      const view = shallowRef(null);
      let off = null;
      let readSid = null;
      watch(() => props.sid, (sid) => {
        off?.();
        off = null;
        if (readSid) reading.drop(readSid, key);
        readSid = sid;
        view.value = null;
        if (sid) off = store.watch(sid, (v) => {
          view.value = v;
        });
      }, { immediate: true });
      const solo = computed(() => soloOf(props.params));
      const labels = computed(() => labelsOf(view.value, solo.value));
      const sel = ref("");
      watch(labels, (ls) => {
        sel.value = keepSelection(ls, sel.value);
      }, { immediate: true });
      const lines = computed(() => sel.value ? view.value?.lines[sel.value] ?? [] : []);
      const searching = ref(false), q = ref(""), times = ref(false), helping = ref(false);
      const shown = computed(() => filterLines(lines.value, q.value));
      const box = ref(null);
      const search = ref(null);
      const tail = ref(newTail());
      const scrollEnd = () => nextTick(() => {
        if (box.value) box.value.scrollTop = box.value.scrollHeight;
      });
      const report = () => {
        if (props.sid) reading.set(props.sid, key, readingOf(sel.value, tail.value.atEnd));
      };
      watch([sel, shown], () => {
        tail.value = stepTail(tail.value, sel.value, shown.value);
        if (tail.value.atEnd) scrollEnd();
        report();
      }, { immediate: true });
      watch(() => props.sid, report);
      const setAtEnd = (atEnd) => {
        if (atEnd === tail.value.atEnd) return;
        tail.value = { ...tail.value, atEnd, fresh: atEnd ? 0 : tail.value.fresh };
        report();
      };
      const onScroll = () => {
        if (box.value?.clientHeight) setAtEnd(nearEnd(box.value));
      };
      const toEnd = () => {
        setAtEnd(true);
        scrollEnd();
      };
      let hidden = false;
      const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
        const b = box.value;
        if (!b) return;
        if (!b.clientHeight) {
          hidden = true;
          return;
        }
        if (hidden && tail.value.atEnd) b.scrollTop = b.scrollHeight;
        hidden = false;
      });
      watch(box, (b, was) => {
        if (was) ro?.unobserve(was);
        if (b) ro?.observe(b);
      });
      const tabs = /* @__PURE__ */ new Map();
      const tabKey = (e, i) => {
        const j = tabTarget(e.key, i, labels.value.length);
        if (j < 0) return;
        e.preventDefault();
        sel.value = labels.value[j];
        nextTick(() => tabs.get(sel.value)?.focus());
      };
      const toggleSearch = () => {
        searching.value = !searching.value;
        if (!searching.value) q.value = "";
        else nextTick(() => search.value?.focus());
      };
      const clear = async () => {
        const sid = props.sid, label = sel.value;
        if (!sid || !label) return;
        const n = view.value?.lines[label]?.length ?? 0;
        if (await mu.ui.confirm({ title: COPY.confirmClear(label), body: COPY.confirmClearBody(label, n), confirm: COPY.clear, danger: true })) store.clear(label, sid);
      };
      const editRules = () => mu.settings.open();
      const popOut = (label = sel.value) => {
        if (!label || solo.value) return;
        mu.panels.open("feed", { feed: label, instance: label }, { title: COPY.popTitle(label), ...props.sid ? { sid: props.sid } : {} });
      };
      onBeforeUnmount(() => {
        ro?.disconnect();
        off?.();
        off = null;
        if (readSid) reading.drop(readSid, key);
        readSid = null;
      });
      const tool = (label, attrs, on = false) => h("button", { type: "button", class: [c.cmd, { [c.on]: on }], ...attrs }, label);
      const spanOf = (s, k) => s.href ? h("a", { key: k, href: s.href, target: "_blank", rel: "noopener noreferrer", class: s.cls, style: s.style }, s.text) : h("span", { key: k, class: s.cls, style: s.style }, s.text);
      return () => {
        const ls = labels.value, cur = sel.value;
        if (!ls.length) {
          return h("div", { class: "mu-feeds", "data-testid": "feeds-panel" }, [
            h("div", { class: "intro", "data-testid": "feeds-intro" }, [
              h("p", { class: "ihead" }, COPY.introHead),
              h("p", null, COPY.introText),
              h("ol", null, COPY.introSteps.map((t, i) => h("li", { key: i }, t))),
              h("button", { type: "button", class: [c.cmd, "primary", "make"], "data-testid": "feeds-add", onClick: editRules }, COPY.addFeed)
            ])
          ]);
        }
        const bar = h("div", { class: "fbar" }, [
          solo.value ? h("span", { class: "solo" }, solo.value) : h("div", { class: "ftabs", role: "tablist", "aria-label": COPY.title }, ls.map((l, i) => {
            const n = unreadOf(view.value, l, cur);
            const total = view.value?.lines[l]?.length ?? 0;
            return h("button", {
              key: l,
              type: "button",
              role: "tab",
              class: ["ftab", { on: l === cur, unread: n > 0 }],
              "data-testid": "feed-tab",
              ref: (el) => {
                if (el) tabs.set(l, el);
                else tabs.delete(l);
              },
              "aria-selected": l === cur,
              tabindex: l === cur ? 0 : -1,
              "aria-label": tabLabel(l, n),
              title: COPY.tabTip(l, total),
              onClick: () => {
                sel.value = l;
              },
              onDblclick: () => popOut(l),
              onKeydown: (e) => tabKey(e, i)
            }, [h("span", { class: "fname" }, l), n ? h("span", { class: ["fbadge", c.count], "aria-hidden": "true" }, String(n)) : null]);
          })),
          h("span", { class: "tools", role: "toolbar", "aria-label": "Feed tools" }, [
            tool(COPY.search, { "aria-pressed": searching.value, "aria-label": "Search this feed", title: "search", onClick: toggleSearch }, searching.value),
            tool(COPY.times, { "aria-pressed": times.value, "aria-label": "Timestamps", title: "timestamps", onClick: () => {
              times.value = !times.value;
            } }, times.value),
            !solo.value && cur ? tool(COPY.popOut, { title: "this feed in its own panel", "aria-label": `Open ${cur} in its own panel`, "data-testid": "feed-popout", onClick: () => popOut() }) : null,
            tool(COPY.rules, { "aria-label": "Edit feed rules", title: COPY.rulesTip, onClick: editRules }),
            cur ? tool(COPY.clear, { title: "empty this feed", "aria-label": `Clear ${cur} feed`, "data-testid": "feed-clear", onClick: () => {
              void clear();
            } }) : null,
            tool(COPY.help, { "aria-pressed": helping.value, "aria-label": COPY.helpTitle, title: "what the buttons do", "data-testid": "feed-help", onClick: () => {
              helping.value = !helping.value;
            } }, helping.value)
          ])
        ]);
        const searchRow = searching.value ? h("div", { class: "fsearch" }, [
          h("input", {
            ref: search,
            class: [c.field, c.placeholder],
            value: q.value,
            placeholder: COPY.searchIn(cur),
            "aria-label": COPY.searchIn(cur),
            "data-testid": "feed-search",
            onInput: (e) => {
              q.value = e.target.value;
            },
            onKeydown: (e) => {
              if (e.key === "Escape") {
                searching.value = false;
                q.value = "";
              }
            }
          }),
          h("span", { class: "cnt", "aria-live": "polite" }, [String(shown.value.length), " ", h("span", { class: "sr-only" }, "matching lines")])
        ]) : null;
        const helpRow = helping.value ? h("div", { class: "fhelp", "data-testid": "feed-help-strip", role: "note", "aria-label": COPY.helpTitle }, [
          h("dl", null, COPY.helpRows.flatMap(([k, v]) => [h("dt", { key: `${k}:t` }, k), h("dd", { key: `${k}:d` }, v)])),
          h("p", null, COPY.helpNote)
        ]) : null;
        const rows = shown.value.map((l) => h("div", { key: l.id, class: ["fline", ANSI, l.rowCls], "data-testid": "feed-line" }, [
          times.value ? h("span", { class: "ts" }, hhmmss(l.ts)) : null,
          ...l.spans.map(spanOf)
        ]));
        const p = pillOf(tail.value);
        const pill = p ? h("button", {
          type: "button",
          class: ["latest", { quiet: p.quiet }],
          "data-testid": "feed-latest",
          onClick: toEnd,
          ...p.quiet ? { "aria-label": COPY.jumpLatest } : {}
        }, p.text) : null;
        return h("div", { class: "mu-feeds", "data-testid": "feeds-panel" }, [
          bar,
          searchRow,
          helpRow,
          h("div", { class: "lines-wrap" }, [
            h("div", {
              ref: box,
              class: "flines",
              role: "log",
              "aria-live": "off",
              tabindex: 0,
              "aria-label": `${cur} feed`,
              "data-focus-region": "feeds",
              onScroll,
              onWheel: (e) => {
                if (e.deltaY < 0) setAtEnd(false);
              }
            }, [
              ...rows,
              shown.value.length ? null : h("p", { class: [c.empty, "fempty"] }, q.value.trim() ? COPY.noMatches : COPY.empty),
              shown.value.length || q.value.trim() ? null : h("p", { class: "fempty-hint", "data-testid": "feed-empty-hint" }, [COPY.emptyHint(cur), " ", h("button", { type: "button", class: c.cmd, onClick: editRules }, COPY.rules)])
            ]),
            pill
          ])
        ]);
      };
    }
  });
}

// src/store.ts
var FEED_CAP = 500;
var ROUTES_KEY = "routes";
var REBUILD_MS = 150;
var QUERY_LIMIT = 5e3;
function ruleTargets(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.filter((r) => r && typeof r === "object" && r.enabled !== false).map((r) => typeof r.target === "string" ? r.target.trim() : "").filter(Boolean);
}
var before = (a, b) => a.ts - b.ts || (a.id > 0 && b.id > 0 ? a.id - b.id : 0);
function merge(a, b, key) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) out.push(before(key(b[j]), key(a[i])) < 0 ? b[j++] : a[i++]);
  return out.concat(a.slice(i), b.slice(j));
}
var sameBuf = (x, y) => x.length === y.length && x.every((e, i) => e.line.id === y[i].line.id && e.edit === y[i].edit);
function createStore(mu) {
  const sessions = /* @__PURE__ */ new Map();
  const session = (sid) => {
    let s = sessions.get(sid);
    if (!s) sessions.set(sid, s = { lines: {}, unread: {}, viewing: "", cleared: {}, fns: /* @__PURE__ */ new Set(), attached: 0, offRules: null, timer: null });
    return s;
  };
  const scope = (sid) => {
    const w = sessions.get(sid)?.worldId;
    return w ? { worldId: w } : { sid };
  };
  const rulesOf = (sid) => {
    try {
      return mu.settings.get(ROUTES_KEY, scope(sid));
    } catch {
      return [];
    }
  };
  const labelsFor = (sid) => {
    const lines = sessions.get(sid)?.lines ?? {};
    const withLines = Object.keys(lines).filter((l) => lines[l].length);
    return [.../* @__PURE__ */ new Set([...ruleTargets(rulesOf(sid)), ...withLines])];
  };
  const get = (sid) => {
    const s = sessions.get(sid);
    return {
      labels: labelsFor(sid),
      lines: Object.fromEntries(Object.entries(s?.lines ?? {}).map(([l, buf]) => [l, buf.map((e) => e.line)])),
      unread: { ...s?.unread ?? {} }
    };
  };
  const emit = (sid) => {
    const s = sessions.get(sid);
    if (!s?.fns.size) return;
    const state = get(sid);
    for (const fn of [...s.fns]) fn(state);
  };
  const rebuild = (sid) => {
    const s = sessions.get(sid);
    const query = mu.lines?.query, testRoutes = mu.lines?.testRoutes;
    if (!s || typeof query !== "function") return false;
    const raw = rulesOf(sid);
    const rules = Array.isArray(raw) ? raw : [];
    let held;
    try {
      held = query(sid, { rules, limit: QUERY_LIMIT });
    } catch {
      return false;
    }
    if (!Array.isArray(held)) return false;
    const seen = new Set(held.map((h3) => h3.line.id));
    const extra = /* @__PURE__ */ new Map();
    for (const buf of Object.values(s.lines)) for (const e of buf) if (!e.edit && !seen.has(e.line.id)) extra.set(e.line.id, e.line);
    const rematched = [];
    if (typeof testRoutes === "function") {
      for (const line of [...extra.values()].sort(before)) {
        let r;
        try {
          r = testRoutes(line.text, rules);
        } catch {
          continue;
        }
        if (r?.targets?.length) rematched.push({ line, targets: r.targets, move: r.move });
      }
    }
    const all = merge(held, rematched, (h3) => h3.line);
    const derived = {};
    for (const h3 of all) for (const t of h3.targets) {
      const label = typeof t === "string" ? t.trim() : "";
      const cut = label ? s.cleared[label] : void 0;
      if (label && !(cut && before(h3.line, cut) <= 0)) (derived[label] ??= []).push({ line: h3.line, edit: false });
    }
    let changed = false;
    for (const label of /* @__PURE__ */ new Set([...Object.keys(s.lines), ...Object.keys(derived)])) {
      const old = s.lines[label] ?? [];
      const edits = old.filter((e) => e.edit);
      const editIds = new Set(edits.map((e) => e.line.id));
      let next = merge((derived[label] ?? []).filter((e) => !editIds.has(e.line.id)), edits, (e) => e.line);
      if (next.length > FEED_CAP) next = next.slice(next.length - FEED_CAP);
      if (sameBuf(old, next)) continue;
      changed = true;
      const n = s.unread[label] ?? 0;
      const was = new Set(old.slice(Math.max(0, old.length - n)).map((e) => `${e.edit ? "e" : "r"}${e.line.id}`));
      s.lines[label] = next;
      s.unread[label] = s.viewing === label ? 0 : next.filter((e) => was.has(`${e.edit ? "e" : "r"}${e.line.id}`)).length;
    }
    if (changed) emit(sid);
    return true;
  };
  const schedule = (sid) => {
    const s = sessions.get(sid);
    if (!s || typeof mu.lines?.query !== "function") return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.timer = null;
      if (sessions.get(sid) === s) rebuild(sid);
    }, REBUILD_MS);
  };
  const followRules = (sid) => {
    const s = session(sid);
    s.offRules?.();
    s.offRules = mu.settings.watch(ROUTES_KEY, (_v, meta) => {
      if (!meta?.replay) {
        emit(sid);
        schedule(sid);
      }
    }, scope(sid));
  };
  const unfollow = (s) => {
    if (s.fns.size || s.attached) return;
    s.offRules?.();
    s.offRules = null;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
  };
  const drop = (s) => {
    s.offRules?.();
    s.offRules = null;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
  };
  return {
    deliver(target, line, ctx) {
      const label = typeof target === "string" ? target.trim() : "";
      if (!label || !ctx?.sid) return;
      const s = session(ctx.sid);
      if (ctx.worldId && ctx.worldId !== s.worldId) {
        s.worldId = ctx.worldId;
        if (s.offRules) followRules(ctx.sid);
      }
      const buf = s.lines[label] ??= [];
      buf.push({ line, edit: !ctx.rule });
      if (buf.length > FEED_CAP) buf.splice(0, buf.length - FEED_CAP);
      if (s.viewing !== label) s.unread[label] = (s.unread[label] ?? 0) + 1;
      emit(ctx.sid);
    },
    watch(sid, fn) {
      const s = session(sid);
      s.fns.add(fn);
      if (!s.offRules) followRules(sid);
      fn(get(sid));
      return () => {
        if (s.fns.delete(fn)) unfollow(s);
      };
    },
    attach(sid, worldId) {
      const s = session(sid);
      s.attached++;
      if (worldId && worldId !== s.worldId) {
        s.worldId = worldId;
        if (s.offRules) followRules(sid);
      }
      if (!s.offRules) followRules(sid);
      let on = true;
      return () => {
        if (!on) return;
        on = false;
        s.attached--;
        unfollow(s);
      };
    },
    rebuild,
    flush() {
      for (const [sid, s] of sessions) if (s.timer) {
        clearTimeout(s.timer);
        s.timer = null;
        rebuild(sid);
      }
    },
    viewing(label, sid) {
      const s = session(sid);
      const l = typeof label === "string" ? label : "";
      s.viewing = l;
      if (l && s.unread[l]) {
        s.unread[l] = 0;
        emit(sid);
      }
    },
    clear(label, sid) {
      const s = session(sid);
      let cut = s.lines[label]?.at(-1)?.line;
      try {
        const last = typeof mu.lines?.query === "function" ? mu.lines.query(sid, { limit: 1 }) : null;
        const l = Array.isArray(last) ? last[0]?.line : void 0;
        if (l && (!cut || before(cut, l) < 0)) cut = l;
      } catch {
      }
      if (cut) s.cleared[label] = cut;
      s.lines[label] = [];
      s.unread[label] = 0;
      emit(sid);
    },
    forget(sid) {
      const s = sessions.get(sid);
      if (!s) return;
      drop(s);
      sessions.delete(sid);
    },
    dispose() {
      for (const s of sessions.values()) drop(s);
      sessions.clear();
    },
    labelsFor,
    get
  };
}

// src/settingsPage.ts
import { computed as computed2, defineComponent as defineComponent2, h as h2, nextTick as nextTick2, onBeforeUnmount as onBeforeUnmount2, ref as ref2, shallowRef as shallowRef2, watch as watch2 } from "vue";
var PAGE = {
  intro: "A feed is a side channel of the terminal. Each rule below watches every line the game sends; a matching line is copied into the named feed, or moved there so the terminal stays quiet. The Feeds panel shows one tab per feed.",
  howTitle: "How to match",
  howText: "Each rule matches as Text or as a Regex. Text matches anywhere in the line, ignoring case, exactly as typed: [vox] means the five characters [vox]. Regex reads the match as a regular expression, ignoring case: ^\\w+ tells you, or .+ for every line. Several rules may share one feed, and a line may land in several feeds.",
  examplesTitle: "Examples",
  examples: [
    { match: "[vox]", mode: "text", target: "vox", move: false, why: "copy the public channel into its own tab" },
    { match: "tells you,", mode: "text", target: "tells", move: true, why: "keep private messages out of the terminal" },
    { match: "^(You|.+) (hit|miss|parr)", mode: "regex", target: "combat", move: true, why: "put combat lines in their own tab" }
  ],
  useExample: "Use",
  rulesTitle: "Rules",
  rulesHint: "checked in order, top to bottom",
  empty: "No rules yet. Add one, or start from an example.",
  addRule: "Add rule",
  enabled: "Enabled",
  pattern: "Match",
  patternPh: (mode) => mode === "regex" ? "regular expression" : "text to find",
  text: "Text",
  regex: "Regex",
  matchLabel: "How the match is read",
  matchHint: (mode) => mode === "regex" ? "a regular expression" : "plain text, anywhere in the line",
  target: "Feed",
  targetPh: "feed name",
  targetMissing: "Name the feed, or this rule does nothing.",
  copy: "Copy",
  move: "Move",
  modeHint: (move2) => move2 ? "leaves the terminal" : "stays in the terminal too",
  modeLabel: "What happens to a matching line",
  up: "Move up",
  down: "Move down",
  remove: "Remove rule",
  tryTitle: "Try it",
  tryHint: "paste a line from the game to see where it goes",
  tryPh: "a line of game output",
  tryNone: "No rule matches this line. It stays in the terminal.",
  tryHit: (targets, move2) => `Goes to ${targets.map((t) => `\u201C${t}\u201D`).join(" and ")}, and ${move2 ? "leaves the terminal" : "stays in the terminal too"}.`,
  panelTitle: "The Feeds panel",
  panelText: "It is listed in Views, and it opens by itself when a feed gets its first line. Lines are kept per session, 500 per feed.",
  openPanel: "Open panel",
  footer: "Feeds are per world and sync to your account. Highlights, gags and aliases are under Settings \u2192 Triggers.",
  noWorld: "Pick a world to edit its feeds."
};
var PAGE_CSS = [
  ".mu-feeds-page .fr-grp { display: flex; align-items: baseline; margin: 12px 0 5px; padding-bottom: 3px; font-size: .66rem; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-bright); border-bottom: 1px solid var(--border); }",
  ".mu-feeds-page .fr-hint { margin-left: .6ch; color: var(--fg-faint); letter-spacing: .04em; text-transform: none; }",
  ".mu-feeds-page .fr-intro, .mu-feeds-page .fr-text { margin: 4px 0 2px; font-size: .78rem; line-height: 1.55; color: var(--fg); }",
  ".mu-feeds-page .fr-intro { color: var(--fg-dim); }",
  ".mu-feeds-page .fr-empty { margin: 2px 0 4px; font-size: .74rem; color: var(--fg-faint); }",
  ".mu-feeds-page .fr-list { display: flex; flex-direction: column; gap: 6px; }",
  ".mu-feeds-page .fr-card { display: flex; flex-direction: column; gap: 3px; padding: 6px 9px 5px; background: var(--bg); border: 1px solid var(--border); border-left: 2px solid var(--accent); transition: border-color .12s ease; }",
  ".mu-feeds-page .fr-card:focus-within { border-color: var(--border-bright); border-left-color: var(--accent-bright); }",
  ".mu-feeds-page .fr-card.off { border-left-color: var(--border-bright); }",
  ".mu-feeds-page .fr-card.off .fr-field input { color: var(--fg-faint); }",
  ".mu-feeds-page .fr-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }",
  ".mu-feeds-page .fr-field { display: flex; flex-direction: column; gap: 1px; min-width: 0; }",
  ".mu-feeds-page .fr-field > span { font-size: .58rem; }",
  ".mu-feeds-page .fr-field input { width: 100%; font-size: .8rem; padding: 2px 2px 3px; min-height: 24px; }",
  '.mu-feeds-page .fr-field input[aria-invalid="true"] { border-bottom-color: var(--alert); }',
  ".mu-feeds-page .fr-grow { flex: 1 1 14ch; }",
  ".mu-feeds-page .fr-feed { flex: 0 1 11ch; min-width: 9ch; }",
  ".mu-feeds-page .fr-arrow { flex: 0 0 auto; align-self: flex-end; padding-bottom: 4px; color: var(--accent); }",
  ".mu-feeds-page .fr-foot { justify-content: space-between; align-items: center; row-gap: 0; }",
  ".mu-feeds-page .fr-mode { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; }",
  ".mu-feeds-page .fr-mode button, .mu-feeds-page .fr-on { font-size: .62rem; }",
  ".mu-feeds-page .fr-modehint { margin-left: .6ch; font-size: .64rem; color: var(--fg-faint); white-space: nowrap; }",
  ".mu-feeds-page .fr-tools { display: flex; align-items: center; gap: 2px; margin-left: auto; flex: 0 0 auto; }",
  ".mu-feeds-page .fr-err { margin: 0; padding: 1px 0 0 2px; font-size: .7rem; color: var(--alert); }",
  ".mu-feeds-page .fr-add { margin-top: 8px; }",
  ".mu-feeds-page .fr-examples { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }",
  ".mu-feeds-page .fr-ex { display: flex; align-items: center; gap: .8ch; flex-wrap: wrap; padding: 5px 2px; border-bottom: 1px solid var(--border); font-size: .74rem; }",
  ".mu-feeds-page .fr-ex:last-child { border-bottom: 0; }",
  ".mu-feeds-page .fr-ex-pat { font-family: inherit; color: var(--fg); padding: 0 .4ch; background: var(--bg-deep); }",
  ".mu-feeds-page .fr-ex-how { color: var(--fg-faint); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; }",
  ".mu-feeds-page .fr-ex-feed { color: var(--accent-bright); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }",
  ".mu-feeds-page .fr-ex-why { flex: 1 1 12ch; color: var(--fg-faint); font-size: .7rem; }",
  ".mu-feeds-page .fr-ex-use { margin-left: auto; }",
  ".mu-feeds-page .fr-try { width: 100%; font-size: .82rem; margin-top: 2px; }",
  ".mu-feeds-page .fr-trial { margin: 6px 0 0; padding-left: 1ch; border-left: 2px solid var(--border-bright); font-size: .74rem; color: var(--fg-dim); }",
  ".mu-feeds-page .fr-trial.hit { border-left-color: var(--ok); color: var(--fg); }",
  ".mu-feeds-page .fr-foot-note { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); font-size: .74rem; color: var(--fg-dim); }"
].join("\n");
var REGEX_FORM = /^\/(.+)\/([a-z]*)$/s;
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hostPattern(match, mode, flags = "") {
  const m = String(match ?? "").trim();
  if (!m) return "";
  return mode === "regex" ? `/${m}/${flags}` : `/${escapeRe(m)}/i`;
}
function fromLegacy(pattern) {
  const p = String(pattern ?? "").trim();
  const m = REGEX_FORM.exec(p);
  return m ? { match: m[1], mode: "regex", ...m[2] ? { flags: m[2] } : {} } : { match: p, mode: "text" };
}
var seq = 0;
var newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;
function move(list, i, d) {
  const j = i + d;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}
function readRules(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((r) => r && typeof r === "object").map((r) => {
    const pattern = typeof r.pattern === "string" ? r.pattern : "";
    const how = r.mode === "text" || r.mode === "regex" ? { match: typeof r.match === "string" ? r.match : fromLegacy(pattern).match, mode: r.mode, ...typeof r.flags === "string" && r.flags ? { flags: r.flags } : {} } : fromLegacy(pattern);
    const { flags: _f, ...rest } = r;
    return {
      ...rest,
      id: typeof r.id === "string" && r.id ? r.id : newId(),
      ...how,
      pattern: hostPattern(how.match, how.mode, how.mode === "regex" ? how.flags : ""),
      target: typeof r.target === "string" ? r.target : typeof r.label === "string" ? r.label : ""
    };
  });
}
function matchError(mu, r) {
  return mu.lines.patternError(hostPattern(r.match, r.mode, r.mode === "regex" ? r.flags : ""));
}
function createSettingsPage(mu) {
  const c = mu.ui.css;
  return defineComponent2({
    name: "FeedsSettingsPage",
    props: { sid: { type: String, default: null }, worldId: { type: String, default: null }, params: { type: Object, default: () => ({}) } },
    setup(props) {
      const rules = shallowRef2([]);
      let off = null;
      watch2(() => props.worldId, (wid) => {
        off?.();
        off = null;
        rules.value = [];
        if (wid) off = mu.settings.watch(ROUTES_KEY, (v) => {
          rules.value = readRules(v);
        }, { worldId: wid });
      }, { immediate: true });
      onBeforeUnmount2(() => {
        off?.();
        off = null;
      });
      const edit = (fn) => {
        const wid = props.worldId;
        if (!wid) return;
        const next = readRules(mu.settings.get(ROUTES_KEY, { worldId: wid })).map((r) => ({ ...r }));
        fn(next);
        for (const r of next) r.pattern = hostPattern(r.match, r.mode, r.mode === "regex" ? r.flags : "");
        mu.settings.set(ROUTES_KEY, next, wid);
        rules.value = next;
      };
      const set = (i, p) => edit((l) => {
        if (l[i]) Object.assign(l[i], p);
      });
      const val = (e) => e.target.value;
      const add = (seed) => edit((l) => {
        l.push({ id: newId(), match: seed?.match ?? "", mode: seed?.mode ?? "text", pattern: "", target: seed?.target ?? "", move: seed?.move ?? false });
      });
      const hasExample = (ex) => rules.value.some((r) => r.match === ex.match && r.mode === ex.mode && r.target === ex.target);
      const targets = computed2(() => [...new Set(rules.value.map((r) => r.target.trim()).filter(Boolean))]);
      const root = ref2(null);
      const addAndFocus = () => {
        add();
        nextTick2(() => root.value?.querySelector(".fr-card:last-child input.fr-match")?.focus());
      };
      const sample = ref2("");
      const trial = computed2(() => {
        const text = sample.value.trim();
        if (!text || !props.worldId) return null;
        const r = mu.lines.testRoutes(text, rules.value);
        return r.targets.length ? { text: PAGE.tryHit(r.targets, r.move), hit: true } : { text: PAGE.tryNone, hit: false };
      });
      const openPanel = () => mu.panels.open("feeds", void 0, props.sid ? { sid: props.sid } : void 0);
      const grp = (title, hint) => h2("div", { class: "fr-grp" }, [title, hint ? h2("span", { class: "fr-hint" }, hint) : null]);
      const card = (r, i, n) => {
        const err = matchError(mu, r);
        const noTarget = !r.target.trim() && !!r.match.trim();
        const on = r.enabled !== false;
        return h2("div", { key: r.id, class: ["fr-card", { off: !on }], role: "group", "aria-label": `Rule ${i + 1}`, "data-rule": "route" }, [
          h2("div", { class: "fr-row" }, [
            h2("label", { class: "fr-field fr-grow" }, [
              h2("span", { class: c.label }, PAGE.pattern),
              h2("input", {
                class: [c.field, "fr-match"],
                placeholder: PAGE.patternPh(r.mode),
                value: r.match,
                "aria-label": `Rule ${i + 1} pattern`,
                "aria-invalid": !!err,
                spellcheck: false,
                onInput: (e) => set(i, { match: val(e) })
              })
            ]),
            h2("span", { class: "fr-arrow", "aria-hidden": "true" }, "\u2192"),
            h2("label", { class: "fr-field fr-feed" }, [
              h2("span", { class: c.label }, PAGE.target),
              h2("input", {
                class: [c.field, "fr-target"],
                placeholder: PAGE.targetPh,
                list: "mu-feeds-names",
                value: r.target,
                "aria-label": `Rule ${i + 1} feed`,
                "aria-invalid": noTarget,
                spellcheck: false,
                onInput: (e) => set(i, { target: val(e) })
              })
            ])
          ]),
          h2("div", { class: "fr-row fr-foot" }, [
            h2("div", { class: "fr-mode fr-how", role: "radiogroup", "aria-label": `Rule ${i + 1}: ${PAGE.matchLabel}` }, [
              h2("button", { type: "button", role: "radio", class: c.toggle, "aria-checked": r.mode === "text", "data-match": "text", onClick: () => set(i, { mode: "text" }) }, PAGE.text),
              h2("button", { type: "button", role: "radio", class: c.toggle, "aria-checked": r.mode === "regex", "data-match": "regex", onClick: () => set(i, { mode: "regex" }) }, PAGE.regex),
              h2("span", { class: "fr-modehint" }, PAGE.matchHint(r.mode))
            ]),
            h2("div", { class: "fr-mode", role: "radiogroup", "aria-label": PAGE.modeLabel }, [
              h2("button", { type: "button", role: "radio", class: c.toggle, "aria-checked": !r.move, "data-mode": "copy", onClick: () => set(i, { move: false }) }, PAGE.copy),
              h2("button", { type: "button", role: "radio", class: c.toggle, "aria-checked": !!r.move, "data-mode": "move", onClick: () => set(i, { move: true }) }, PAGE.move),
              h2("span", { class: "fr-modehint" }, PAGE.modeHint(!!r.move))
            ]),
            h2("div", { class: "fr-tools" }, [
              h2("button", { type: "button", class: [c.toggle, "fr-on"], role: "switch", "aria-checked": on, "aria-label": `Rule ${i + 1} enabled`, onClick: () => set(i, { enabled: !on }) }, PAGE.enabled),
              h2("button", { type: "button", class: [c.cmd, c.sq], disabled: i === 0, "aria-label": `Move rule ${i + 1} up`, title: PAGE.up, onClick: () => edit((l) => move(l, i, -1)) }, "\u2191"),
              h2("button", { type: "button", class: [c.cmd, c.sq], disabled: i === n - 1, "aria-label": `Move rule ${i + 1} down`, title: PAGE.down, onClick: () => edit((l) => move(l, i, 1)) }, "\u2193"),
              h2("button", { type: "button", class: [c.cmd, c.sq, c.warn], "aria-label": `Remove rule ${i + 1}`, title: PAGE.remove, onClick: () => edit((l) => {
                l.splice(i, 1);
              }) }, "\xD7")
            ])
          ]),
          err ? h2("p", { class: "fr-err", "data-testid": "feeds-rule-error" }, err) : noTarget ? h2("p", { class: "fr-err", "data-testid": "feeds-rule-error" }, PAGE.targetMissing) : null
        ]);
      };
      return () => {
        if (!props.worldId) return h2("div", { class: "mu-feeds-page", "data-testid": "feeds-page" }, [h2("p", { class: c.empty }, PAGE.noWorld)]);
        const rs = rules.value, t = trial.value;
        return h2("div", { ref: root, class: "mu-feeds-page", "data-testid": "feeds-page" }, [
          h2("p", { class: "fr-intro" }, PAGE.intro),
          grp(PAGE.rulesTitle, PAGE.rulesHint),
          rs.length ? null : h2("p", { class: "fr-empty", "data-testid": "feeds-empty" }, PAGE.empty),
          h2("div", { class: "fr-list" }, rs.map((r, i) => card(r, i, rs.length))),
          h2("datalist", { id: "mu-feeds-names" }, targets.value.map((l) => h2("option", { key: l, value: l }))),
          h2("button", { type: "button", class: [c.cmd, c.primary, "fr-add"], "data-testid": "feeds-add-rule", onClick: addAndFocus }, PAGE.addRule),
          grp(PAGE.examplesTitle),
          h2("ul", { class: "fr-examples" }, PAGE.examples.map((ex) => h2("li", { key: ex.match, class: "fr-ex" }, [
            h2("code", { class: "fr-ex-pat" }, ex.match),
            h2("span", { class: "fr-ex-how" }, (ex.mode === "regex" ? PAGE.regex : PAGE.text).toLowerCase()),
            h2("span", { class: "fr-arrow", "aria-hidden": "true" }, "\u2192"),
            h2("span", { class: "fr-ex-feed" }, ex.target),
            h2("span", { class: "fr-ex-why" }, `${ex.why} (${(ex.move ? PAGE.move : PAGE.copy).toLowerCase()})`),
            h2("button", {
              type: "button",
              class: [c.cmd, "fr-ex-use"],
              disabled: hasExample(ex),
              "aria-label": `Use example: ${ex.match} to ${ex.target}`,
              "data-testid": "feeds-example",
              onClick: () => add(ex)
            }, PAGE.useExample)
          ]))),
          grp(PAGE.howTitle),
          h2("p", { class: "fr-text" }, PAGE.howText),
          grp(PAGE.tryTitle, PAGE.tryHint),
          h2("input", {
            class: [c.field, "fr-try"],
            placeholder: PAGE.tryPh,
            "aria-label": PAGE.tryTitle,
            spellcheck: false,
            value: sample.value,
            "data-testid": "feeds-try",
            onInput: (e) => {
              sample.value = val(e);
            }
          }),
          t ? h2("p", { class: ["fr-trial", { hit: t.hit }], "aria-live": "polite", "data-testid": "feeds-trial" }, t.text) : null,
          grp(PAGE.panelTitle),
          h2("p", { class: "fr-text" }, [PAGE.panelText, " ", h2("button", { type: "button", class: c.cmd, "data-testid": "feeds-open-panel", onClick: openPanel }, PAGE.openPanel)]),
          h2("p", { class: "fr-foot-note" }, PAGE.footer)
        ]);
      };
    }
  });
}

// src/index.ts
var SETTINGS = {
  title: "Feeds",
  tile: { glyph: "\u21F6", order: 950, width: "min(34rem, 94vw)" },
  items: [{ key: ROUTES_KEY, kind: "json", scope: "world", default: [], label: "Feed routing" }]
};
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    const subs = ctx.subscriptions;
    const store = createStore(mu);
    subs.push(mu.ui.style(FEEDS_CSS));
    subs.push(mu.ui.style(PAGE_CSS));
    subs.push(mu.settings.define({ ...SETTINGS, component: mu.panels.vue(createSettingsPage(mu)) }));
    subs.push(mu.lines.route({ id: "feeds", rules: ROUTES_KEY, edits: true, deliver: (t, line, c) => store.deliver(t, line, c) }));
    const reading = readers((label, sid) => store.viewing(label, sid));
    subs.push(mu.sessions.each((s) => {
      const off = store.attach(s.id, s.worldId);
      return () => {
        off();
        reading.forget(s.id);
        store.forget(s.id);
      };
    }));
    subs.push(() => store.dispose());
    const mount = mu.panels.vue(createPanel(mu, store, reading));
    subs.push(mu.panels.register({ id: "feeds", title: COPY.title, mount, perSession: true, defaultPosition: "right-bottom", order: 50, show: "always" }));
    subs.push(mu.panels.register({ id: "feed", title: COPY.feedTitle, mount, perSession: true, singleton: false, defaultPosition: "float", inViewsMenu: false }));
    subs.push(onFirstLine(mu, store, (sid) => mu.panels.touch("feeds", sid)));
  }
});
export {
  SETTINGS,
  index_default as default
};
