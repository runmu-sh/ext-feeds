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
  addFeed: "Add a feed",
  empty: "Empty.",
  noMatches: "No matches.",
  title: "Feeds",
  feedTitle: "Feed",
  popTitle: (label) => `Feed \xB7 ${label}`,
  confirmClear: (label) => `Clear ${label}?`,
  latest: (n) => `${n} new line${n === 1 ? "" : "s"} \u2193`
};
var FEEDS_CSS = `
.mu-feeds { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-elev); }
.mu-feeds .fbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; }
.mu-feeds .ftabs { display: flex; gap: 2px; flex-wrap: wrap; flex: 1; min-width: 0; }
.mu-feeds .solo { flex: 1; color: var(--accent-bright); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; }
.mu-feeds .ftab { display: inline-flex; align-items: center; background: none; border: 0; border-radius: 0; color: var(--fg-dim); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 2px .8ch; min-height: 24px; transition: color .12s ease, background-color .12s ease; }
.mu-feeds .ftab:hover { color: var(--fg); background: var(--tint-toggle); }
.mu-feeds .ftab.on { color: var(--bg-deep); background: var(--accent); }
.mu-feeds .fbadge { margin-left: .6ch; }
.mu-feeds .tools { display: flex; gap: 3px; flex: 0 0 auto; }
.mu-feeds .fsearch { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mu-feeds .fsearch input { flex: 1; min-width: 0; }
.mu-feeds .cnt { color: var(--fg-dim); font-size: .72rem; }
.mu-feeds .lines-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
.mu-feeds .flines { flex: 1; overflow-y: auto; padding: 6px 10px; line-height: var(--shell-line-height); }
.mu-feeds .fline { white-space: pre-wrap; word-break: break-word; }
.mu-feeds .ts { color: var(--fg-faint); margin-right: .8ch; font-size: .82em; user-select: none; }
.mu-feeds .fempty { padding: 10px 0; margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
.mu-feeds .latest { position: absolute; right: 14px; bottom: 10px; z-index: 5; background: var(--accent); border: 0; border-radius: 0; color: var(--bg-deep); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 3px 10px; min-height: 24px; transition: background-color .12s ease; }
.mu-feeds .latest:hover { background: var(--accent-bright); }
.mu-feeds .intro { padding: 12px; color: var(--fg-dim); font-size: .8rem; }
`;
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
var newTail = () => ({ sel: "", lastId: -Infinity, atEnd: true, fresh: 0 });
function stepTail(t, sel, shown) {
  const lastId = shown.length ? shown[shown.length - 1].id : t.lastId;
  if (sel !== t.sel) return { sel, lastId, atEnd: true, fresh: 0 };
  if (t.atEnd) return { ...t, lastId, fresh: 0 };
  const added = shown.reduce((n, l) => n + (l.id > t.lastId ? 1 : 0), 0);
  return { ...t, lastId: Math.max(lastId, t.lastId), fresh: t.fresh + added };
}
var hasLines = (view) => !!view && Object.values(view.lines).some((ls) => ls.length > 0);
function watchFirstLines(mu, onFirst) {
  const watches = /* @__PURE__ */ new Map();
  const done = /* @__PURE__ */ new Set();
  let alive = true;
  const stop = (sid) => {
    const d = watches.get(sid);
    watches.delete(sid);
    d?.();
  };
  const isLive = (sid) => mu.sessions.list().some((s) => s.id === sid);
  const ensure = (sid) => {
    if (!alive || !sid || done.has(sid) || watches.has(sid)) return;
    let ended = false;
    const end = () => {
      ended = true;
      stop(sid);
    };
    const d = mu.feeds.watch((view) => {
      if (ended) return;
      if (!isLive(sid)) {
        end();
        return;
      }
      if (!hasLines(view)) return;
      done.add(sid);
      onFirst(sid);
      end();
    }, sid);
    if (ended) d();
    else watches.set(sid, d);
  };
  const sync = () => {
    const live = new Set(mu.sessions.list().map((s) => s.id));
    for (const sid of [...watches.keys()]) if (!live.has(sid)) stop(sid);
    for (const sid of [...done]) if (!live.has(sid)) done.delete(sid);
    for (const sid of live) ensure(sid);
  };
  sync();
  const offSwitch = mu.sessions.on("switch", (s) => {
    sync();
    if (s) ensure(s.id);
  });
  const offLine = mu.sessions.on("line", (_l, { sid }) => {
    if (!done.has(sid) && !watches.has(sid)) ensure(sid);
  });
  return () => {
    alive = false;
    offSwitch();
    offLine();
    for (const sid of [...watches.keys()]) stop(sid);
  };
}

// src/panel.ts
function createPanel(mu) {
  const c = mu.ui.css;
  return defineComponent({
    name: "FeedsPanel",
    props: { sid: { type: String, default: null }, worldId: { type: String, default: null }, params: { type: Object, default: () => ({}) } },
    setup(props) {
      const view = shallowRef(null);
      let off = null;
      watch(() => props.sid, (sid) => {
        off?.();
        off = null;
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
      const tell = (label) => {
        if (props.sid) mu.feeds.viewing(label || null, props.sid);
      };
      watch([sel, () => props.sid], () => tell(sel.value), { immediate: true });
      const lines = computed(() => sel.value ? view.value?.lines[sel.value] ?? [] : []);
      const searching = ref(false), q = ref(""), times = ref(false);
      const shown = computed(() => filterLines(lines.value, q.value));
      const box = ref(null);
      const search = ref(null);
      const tail = ref(newTail());
      const scrollEnd = () => nextTick(() => {
        if (box.value) box.value.scrollTop = box.value.scrollHeight;
      });
      const markRead = () => {
        if (sel.value && (view.value?.unread[sel.value] ?? 0) > 0) tell(sel.value);
      };
      watch([sel, shown], () => {
        tail.value = stepTail(tail.value, sel.value, shown.value);
        if (tail.value.atEnd) {
          scrollEnd();
          markRead();
        }
      }, { immediate: true });
      const setAtEnd = (atEnd) => {
        if (atEnd === tail.value.atEnd) return;
        tail.value = { ...tail.value, atEnd, fresh: atEnd ? 0 : tail.value.fresh };
        if (atEnd) markRead();
      };
      const onScroll = () => {
        if (box.value?.clientHeight) setAtEnd(nearEnd(box.value));
      };
      const toEnd = () => {
        setAtEnd(true);
        scrollEnd();
      };
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
      const clear = () => {
        if (props.sid && sel.value && confirm(COPY.confirmClear(sel.value))) mu.feeds.clear(sel.value, props.sid);
      };
      const editRules = () => mu.commands.run("settings.open", "feeds");
      const popOut = () => {
        if (!sel.value) return;
        mu.panels.open("feed", { feed: sel.value, instance: sel.value }, { title: COPY.popTitle(sel.value), ...props.sid ? { sid: props.sid } : {} });
      };
      onBeforeUnmount(() => {
        off?.();
        off = null;
        if (!solo.value) tell(null);
      });
      const tool = (label, attrs, on = false) => h("button", { type: "button", class: [c.tool, { on }], ...attrs }, label);
      const spanOf = (s, k) => s.href ? h("a", { key: k, href: s.href, target: "_blank", rel: "noopener", class: s.cls, style: s.style }, s.text) : h("span", { key: k, class: s.cls, style: s.style }, s.text);
      return () => {
        const ls = labels.value, cur = sel.value;
        if (!ls.length) {
          return h("div", { class: "mu-feeds", "data-testid": "feeds-panel" }, [
            h("div", { class: "intro" }, [h("button", { type: "button", class: [c.cmd, "primary", "make"], onClick: editRules }, COPY.addFeed)])
          ]);
        }
        const bar = h("div", { class: "fbar" }, [
          solo.value ? h("span", { class: "solo" }, solo.value) : h("div", { class: "ftabs", role: "tablist", "aria-label": "Feeds" }, ls.map((l, i) => {
            const n = unreadOf(view.value, l, cur);
            return h("button", {
              key: l,
              type: "button",
              role: "tab",
              class: ["ftab", { on: l === cur }],
              ref: (el) => {
                if (el) tabs.set(l, el);
                else tabs.delete(l);
              },
              "aria-selected": l === cur,
              tabindex: l === cur ? 0 : -1,
              "aria-label": tabLabel(l, n),
              onClick: () => {
                sel.value = l;
              },
              onKeydown: (e) => tabKey(e, i)
            }, [l, n ? h("span", { class: ["fbadge", c.count], "aria-hidden": "true" }, String(n)) : null]);
          })),
          h("span", { class: "tools", role: "toolbar", "aria-label": "Feed tools" }, [
            tool(COPY.search, { "aria-pressed": searching.value, "aria-label": "Search this feed", title: "search", onClick: toggleSearch }, searching.value),
            tool(COPY.times, { "aria-pressed": times.value, "aria-label": "Timestamps", title: "timestamps", onClick: () => {
              times.value = !times.value;
            } }, times.value),
            !solo.value && cur ? tool(COPY.popOut, { title: "own panel", "aria-label": `Open ${cur} in its own panel`, onClick: popOut }) : null,
            tool(COPY.rules, { "aria-label": "Edit feed rules", title: "rules", onClick: editRules }),
            cur ? h("button", { type: "button", class: [c.tool, "danger"], title: "clear", "aria-label": `Clear ${cur} feed`, onClick: clear }, COPY.clear) : null
          ])
        ]);
        const searchRow = searching.value ? h("div", { class: "fsearch" }, [
          h("input", {
            ref: search,
            class: c.field,
            value: q.value,
            placeholder: `search ${cur}\u2026`,
            "aria-label": `Search ${cur}`,
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
        const rows = shown.value.map((l) => h("div", { key: l.id, class: ["fline", l.rowCls], "data-testid": "feed-line" }, [
          times.value ? h("span", { class: "ts" }, hhmmss(l.ts)) : null,
          ...l.spans.map(spanOf)
        ]));
        const t = tail.value;
        const pill = t.atEnd ? null : t.fresh > 0 ? h("button", { type: "button", class: "latest", onClick: toEnd }, COPY.latest(t.fresh)) : h("button", { type: "button", class: "latest", "aria-label": "Jump to the latest line", onClick: toEnd }, "\u2193");
        return h("div", { class: "mu-feeds", "data-testid": "feeds-panel" }, [
          bar,
          searchRow,
          h("div", { class: "lines-wrap" }, [
            h("div", {
              ref: box,
              class: "flines",
              role: "log",
              "aria-live": "off",
              tabindex: 0,
              "aria-label": `${cur} feed`,
              onScroll,
              onWheel: (e) => {
                if (e.deltaY < 0) setAtEnd(false);
              }
            }, [...rows, shown.value.length ? null : h("p", { class: [c.empty, "fempty"] }, q.value.trim() ? COPY.noMatches : COPY.empty)]),
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
    mu.ui.style(FEEDS_CSS);
    const mount = mu.panels.vue(createPanel(mu));
    mu.panels.register({ id: "feeds", title: COPY.title, mount, perSession: true, defaultPosition: "right-bottom", order: 50 });
    mu.panels.register({ id: "feed", title: COPY.feedTitle, mount, perSession: true, singleton: false, defaultPosition: "float", inViewsMenu: false });
    ctx.subscriptions.push(watchFirstLines(mu, (sid) => mu.panels.autoAdd("feeds", sid)));
  }
});
export {
  index_default as default
};
