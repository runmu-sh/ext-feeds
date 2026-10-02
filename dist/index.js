// src/index.ts
import { defineExtension } from "@muclient/sdk";

// src/panel.ts
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";

// src/model.ts
var COPY = {
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
  introText: "A feed is a side channel of the terminal. A rule in Settings \u2192 Feeds watches the game's output for a word or a /regex/ and copies or moves each matching line into a feed of your choosing. Every feed gets a tab here.",
  introSteps: ["Open Settings \u2192 Feeds (or press Add a feed).", "Add a rule: what to match, and the feed it goes to.", "Lines land here as the game sends them."],
  /** Under “Empty.” in a feed that has no lines yet. */
  emptyHint: (label) => `Lines your rules send to \u201C${label}\u201D will show up here.`,
  /** The help strip. */
  helpTitle: "About feeds",
  helpRows: [
    ["Search", "filter this feed; Esc closes"],
    ["Times", "show when each line arrived"],
    ["Pop out", "this feed in its own panel (or double-click its tab)"],
    ["Rules", "edit what goes where (Settings \u2192 Feeds)"],
    ["Clear", "empty this feed on this device"]
  ],
  helpNote: "Feeds are kept per session, up to 500 lines each. A badge counts lines you have not seen; keyboard: \u2190 \u2192 Home End move between tabs, F6 reaches the lines.",
  tabTip: (label, n) => `${label} \xB7 ${n} line${n === 1 ? "" : "s"} \xB7 double-click to pop out`,
  lineCount: (n) => `${n} line${n === 1 ? "" : "s"}`
};
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
function onFirstLine(mu, onFirst) {
  return mu.sessions.each((s) => {
    let done = false, off = null;
    const stop = () => {
      const d2 = off;
      off = null;
      d2?.();
    };
    const d = mu.feeds.watch((view) => {
      if (done || !hasLines(view)) return;
      done = true;
      onFirst(s.id);
      stop();
    }, s.id);
    if (done) d();
    else off = d;
    return stop;
  });
}

// src/panel.ts
var panelSeq = 0;
function createPanel(mu, reading) {
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
        if (sid) off = mu.feeds.watch((v) => {
          view.value = v;
        }, sid);
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
        if (await mu.ui.confirm({ title: COPY.confirmClear(label), body: COPY.confirmClearBody(label, n), confirm: COPY.clear, danger: true })) mu.feeds.clear(label, sid);
      };
      const editRules = () => mu.commands.run("settings.open", "feeds");
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
            tool(COPY.rules, { "aria-label": "Edit feed rules", title: "edit what goes where (Settings \u2192 Feeds)", onClick: editRules }),
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
        const rows = shown.value.map((l) => h("div", { key: l.id, class: ["fline", l.rowCls], "data-testid": "feed-line" }, [
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

// src/index.ts
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    const subs = ctx.subscriptions;
    subs.push(mu.ui.style(FEEDS_CSS));
    const reading = readers((label, sid) => mu.feeds.viewing(label, sid));
    subs.push(mu.sessions.each((s) => () => reading.forget(s.id)));
    const mount = mu.panels.vue(createPanel(mu, reading));
    subs.push(mu.panels.register({ id: "feeds", title: COPY.title, mount, perSession: true, defaultPosition: "right-bottom", order: 50, show: "always" }));
    subs.push(mu.panels.register({ id: "feed", title: COPY.feedTitle, mount, perSession: true, singleton: false, defaultPosition: "float", inViewsMenu: false }));
    subs.push(onFirstLine(mu, (sid) => mu.panels.touch("feeds", sid)));
  }
});
export {
  index_default as default
};
