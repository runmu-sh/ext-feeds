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
  /** The popped-out feed's tab. */
  popTitle: (label) => `Feed: ${label}`,
  confirmClear: (label) => `Clear ${label}?`,
  searchIn: (label) => `Search ${label}`,
  latest: (n) => `${n} new line${n === 1 ? "" : "s"} \u2193`,
  jumpLatest: "Jump to the latest line"
};
var SCOPE = '.ext-panel[data-ext="feeds"]';
var FEEDS_CSS = [
  ".mu-feeds { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-elev); }",
  ".mu-feeds .fbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; }",
  ".mu-feeds .ftabs { display: flex; gap: 2px; flex-wrap: wrap; flex: 1 1 auto; }",
  ".mu-feeds .solo { flex: 1; min-width: 0; color: var(--accent-bright); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".mu-feeds .ftab { display: inline-flex; align-items: center; gap: .6ch; background: none; border: 0; border-radius: 0; color: var(--fg-dim); font-family: inherit; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 2px .8ch; min-height: 24px; cursor: pointer; transition: color .12s ease, background-color .12s ease; }",
  ".mu-feeds .ftab:hover { color: var(--fg); background: var(--tint-toggle); }",
  ".mu-feeds .ftab.on { color: var(--bg-deep); background: var(--accent); }",
  ".mu-feeds .tools { display: flex; flex-wrap: wrap; gap: 2px; flex: 0 1 auto; margin-left: auto; }",
  ".mu-feeds .fsearch { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }",
  ".mu-feeds .fsearch input { flex: 1; min-width: 0; }",
  ".mu-feeds .cnt { color: var(--fg-dim); font-size: .72rem; }",
  ".mu-feeds .lines-wrap { position: relative; flex: 1; min-height: 0; display: flex; }",
  ".mu-feeds .flines { flex: 1; overflow-y: auto; padding: 6px 10px; line-height: var(--shell-line-height, 1.5); }",
  ".mu-feeds .fline { white-space: pre-wrap; word-break: break-word; }",
  ".mu-feeds .ts { color: var(--fg-faint); margin-right: .8ch; font-size: .82em; user-select: none; }",
  ".mu-feeds .fempty { padding: 10px 0; margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }",
  ".mu-feeds .latest { position: absolute; right: 14px; bottom: 10px; z-index: 5; background: var(--accent); border: 0; border-radius: 0; color: var(--bg-deep); font-family: inherit; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 3px 10px; min-height: 24px; cursor: pointer; transition: background-color .12s ease; }",
  ".mu-feeds .latest.quiet { padding: 3px 7px; }",
  ".mu-feeds .latest:hover { background: var(--accent-bright); }",
  ".mu-feeds .intro { padding: 12px; color: var(--fg-dim); font-size: .8rem; line-height: 1.5; }",
  "@media (max-width: 420px) { .mu-feeds .ftab, .mu-feeds .latest { min-height: 32px; } }"
].map((r) => r.startsWith("@media") ? r.replace(/\.mu-feeds/g, `${SCOPE} .mu-feeds`) : `${SCOPE} ${r}`).join("\n");
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
      const searching = ref(false), q = ref(""), times = ref(false);
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
        if (await mu.ui.confirm({ title: COPY.confirmClear(label), confirm: COPY.clear, danger: true })) mu.feeds.clear(label, sid);
      };
      const editRules = () => mu.commands.run("settings.open", "feeds");
      const popOut = () => {
        if (!sel.value) return;
        mu.panels.open("feed", { feed: sel.value, instance: sel.value }, { title: COPY.popTitle(sel.value), ...props.sid ? { sid: props.sid } : {} });
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
            h("div", { class: "intro" }, [h("button", { type: "button", class: [c.cmd, "primary", "make"], "data-testid": "feeds-add", onClick: editRules }, COPY.addFeed)])
          ]);
        }
        const bar = h("div", { class: "fbar" }, [
          solo.value ? h("span", { class: "solo" }, solo.value) : h("div", { class: "ftabs", role: "tablist", "aria-label": COPY.title }, ls.map((l, i) => {
            const n = unreadOf(view.value, l, cur);
            return h("button", {
              key: l,
              type: "button",
              role: "tab",
              class: ["ftab", { on: l === cur }],
              "data-testid": "feed-tab",
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
            !solo.value && cur ? tool(COPY.popOut, { title: "own panel", "aria-label": `Open ${cur} in its own panel`, "data-testid": "feed-popout", onClick: popOut }) : null,
            tool(COPY.rules, { "aria-label": "Edit feed rules", title: "rules", onClick: editRules }),
            cur ? tool(COPY.clear, { title: "clear", "aria-label": `Clear ${cur} feed`, "data-testid": "feed-clear", onClick: () => {
              void clear();
            } }) : null
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luZGV4LnRzIiwgInNyYy9wYW5lbC50cyIsICJzcmMvbW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogRmVlZHMgKEBydW5tdS5zaC9leHQtZmVlZHMpOiB0aGUgRmVlZHMgcGFuZWwuIFRoZSBob3N0IHJvdXRlcyBsaW5lcyBpbnRvIGZlZWRzIChTZXR0aW5ncyBcdTIxOTIgRmVlZHMsIGEgY29yZSBydWxlXG4gKiBzdGFnZSkgYW5kIGtlZXBzIHRoZSBidWZmZXJzIHBlciBzZXNzaW9uOyB0aGlzIGV4dGVuc2lvbiBkcmF3cyB0aGVtIHRocm91Z2ggYG11LmZlZWRzYC5cbiAqXG4gKiAgLSBgZmVlZHNgOiBhIHRhYiBwZXIgZmVlZCB3aXRoIHVucmVhZCBiYWRnZXMsIFNlYXJjaCwgVGltZXMsIFBvcCBvdXQsIFJ1bGVzLCBDbGVhciBhbmQgdGhlIGxhdGVzdCBwaWxsO1xuICogICAgXCJBZGQgYSBmZWVkXCIgKFNldHRpbmdzIFx1MjE5MiBGZWVkcykgd2hpbGUgdGhlcmUgaXMgbm9uZS4gTGlzdGVkIGluIFZpZXdzOyBhIHBlci13b3JsZCBcIlNob3cgcGFuZWxcIiByb3cgKFNESyAxLjEyXG4gKiAgICBgc2hvd2ApIGxldHMgdGhlIHBsYXllciBoaWRlIGl0IG9yIGhhdmUgaXQgYXBwZWFyIG9ubHkgb25jZSBhIGZlZWQgaGFzIGxpbmVzLlxuICogIC0gYGZlZWRgOiBvbmUgZmVlZCBpbiBpdHMgb3duIGZsb2F0aW5nIHBhbmVsIChQb3Agb3V0KSwgYHBhcmFtcy5mZWVkYCA9IHRoZSBsYWJlbCwgdGl0bGVkIFwiRmVlZDogPGxhYmVsPlwiLlxuICogIC0gQXV0by1hZGQ6IHRoZSBmaXJzdCBsaW5lIGEgc2Vzc2lvbidzIGZlZWRzIGhvbGQgYWRkcyBgZmVlZHNgIHRvIHRoYXQgc2Vzc2lvbidzIHdvcmtzcGFjZSAoYG11LnBhbmVscy50b3VjaGApLlxuICovXG5pbXBvcnQgeyBkZWZpbmVFeHRlbnNpb24sIHR5cGUgTXUgfSBmcm9tICdAbXVjbGllbnQvc2RrJztcbmltcG9ydCB7IGNyZWF0ZVBhbmVsIH0gZnJvbSAnLi9wYW5lbCc7XG5pbXBvcnQgeyBDT1BZLCBGRUVEU19DU1MsIG9uRmlyc3RMaW5lLCByZWFkZXJzIH0gZnJvbSAnLi9tb2RlbCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUV4dGVuc2lvbih7XG4gIGFjdGl2YXRlKGN0eCkge1xuICAgIGNvbnN0IG11OiBNdSA9IGN0eC5tdTtcbiAgICBjb25zdCBzdWJzID0gY3R4LnN1YnNjcmlwdGlvbnM7XG4gICAgc3Vicy5wdXNoKG11LnVpLnN0eWxlKEZFRURTX0NTUykpO1xuICAgIC8vIFdoaWNoIGZlZWQgZWFjaCBvcGVuIHBhbmVsIGlzIHJlYWRpbmcsIHBlciBzZXNzaW9uOyB0aGUgaG9zdCBpcyB0b2xkIG9uZSBhdCBhIHRpbWUgKG11LmZlZWRzLnZpZXdpbmcpLlxuICAgIGNvbnN0IHJlYWRpbmcgPSByZWFkZXJzKChsYWJlbCwgc2lkKSA9PiBtdS5mZWVkcy52aWV3aW5nKGxhYmVsLCBzaWQpKTtcbiAgICBzdWJzLnB1c2gobXUuc2Vzc2lvbnMuZWFjaCgocykgPT4gKCkgPT4gcmVhZGluZy5mb3JnZXQocy5pZCkpKTtcbiAgICBjb25zdCBtb3VudCA9IG11LnBhbmVscy52dWUoY3JlYXRlUGFuZWwobXUsIHJlYWRpbmcpKTtcbiAgICBzdWJzLnB1c2gobXUucGFuZWxzLnJlZ2lzdGVyKHsgaWQ6ICdmZWVkcycsIHRpdGxlOiBDT1BZLnRpdGxlLCBtb3VudCwgcGVyU2Vzc2lvbjogdHJ1ZSwgZGVmYXVsdFBvc2l0aW9uOiAncmlnaHQtYm90dG9tJywgb3JkZXI6IDUwLCBzaG93OiAnYWx3YXlzJyB9KSk7XG4gICAgc3Vicy5wdXNoKG11LnBhbmVscy5yZWdpc3Rlcih7IGlkOiAnZmVlZCcsIHRpdGxlOiBDT1BZLmZlZWRUaXRsZSwgbW91bnQsIHBlclNlc3Npb246IHRydWUsIHNpbmdsZXRvbjogZmFsc2UsIGRlZmF1bHRQb3NpdGlvbjogJ2Zsb2F0JywgaW5WaWV3c01lbnU6IGZhbHNlIH0pKTtcbiAgICBzdWJzLnB1c2gob25GaXJzdExpbmUobXUsIChzaWQpID0+IG11LnBhbmVscy50b3VjaCgnZmVlZHMnLCBzaWQpKSk7XG4gIH0sXG59KTtcbiIsICIvKipcbiAqIFRoZSBGZWVkcyBwYW5lbCBhcyBhIFZ1ZSBjb21wb25lbnQgd2l0aCByZW5kZXIgZnVuY3Rpb25zIChgdnVlYCBpcyB0aGUgaG9zdCdzLCB0aHJvdWdoIHRoZSBpbXBvcnQgbWFwKS4gQSB0YWIgcGVyXG4gKiBmZWVkIHdpdGggdW5yZWFkIGJhZGdlcywgU2VhcmNoLCBUaW1lcywgUG9wIG91dCwgUnVsZXMsIENsZWFyLCB0aGUgbGF0ZXN0IHBpbGwsIGFuZCBcIkFkZCBhIGZlZWRcIiB3aGVuIHRoZXJlIGlzIG5vbmUuXG4gKiBXaXRoIGBwYXJhbXMuZmVlZGAgKHRoZSBgZmVlZGAgcGFuZWwpIGl0IHNob3dzIHRoYXQgb25lIGZlZWQgb25seS5cbiAqL1xuaW1wb3J0IHsgY29tcHV0ZWQsIGRlZmluZUNvbXBvbmVudCwgaCwgbmV4dFRpY2ssIG9uQmVmb3JlVW5tb3VudCwgcmVmLCBzaGFsbG93UmVmLCB3YXRjaCwgdHlwZSBWTm9kZSB9IGZyb20gJ3Z1ZSc7XG5pbXBvcnQgdHlwZSB7IERpc3Bvc2UsIEZlZWRMaW5lVmlldywgRmVlZHNWaWV3LCBNdSB9IGZyb20gJ0BtdWNsaWVudC9zZGsnO1xuaW1wb3J0IHtcbiAgQ09QWSwgZmlsdGVyTGluZXMsIGhobW1zcywga2VlcFNlbGVjdGlvbiwgbGFiZWxzT2YsIG5lYXJFbmQsIG5ld1RhaWwsIHBpbGxPZiwgcmVhZGluZ09mLCBzb2xvT2YsIHN0ZXBUYWlsLCB0YWJMYWJlbCxcbiAgdGFiVGFyZ2V0LCB1bnJlYWRPZiwgdHlwZSBSZWFkZXJzLCB0eXBlIFRhaWwsXG59IGZyb20gJy4vbW9kZWwnO1xuXG5sZXQgcGFuZWxTZXEgPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUGFuZWwobXU6IE11LCByZWFkaW5nOiBSZWFkZXJzKSB7XG4gIGNvbnN0IGMgPSBtdS51aS5jc3M7XG4gIHJldHVybiBkZWZpbmVDb21wb25lbnQoe1xuICAgIG5hbWU6ICdGZWVkc1BhbmVsJyxcbiAgICBwcm9wczogeyBzaWQ6IHsgdHlwZTogU3RyaW5nLCBkZWZhdWx0OiBudWxsIH0sIHdvcmxkSWQ6IHsgdHlwZTogU3RyaW5nLCBkZWZhdWx0OiBudWxsIH0sIHBhcmFtczogeyB0eXBlOiBPYmplY3QsIGRlZmF1bHQ6ICgpID0+ICh7fSkgfSB9LFxuICAgIHNldHVwKHByb3BzKSB7XG4gICAgICBjb25zdCBrZXkgPSBgcCR7KytwYW5lbFNlcX1gO1xuICAgICAgY29uc3QgdmlldyA9IHNoYWxsb3dSZWY8RmVlZHNWaWV3IHwgbnVsbD4obnVsbCk7XG4gICAgICBsZXQgb2ZmOiBEaXNwb3NlIHwgbnVsbCA9IG51bGw7XG4gICAgICBsZXQgcmVhZFNpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICB3YXRjaCgoKSA9PiBwcm9wcy5zaWQsIChzaWQpID0+IHtcbiAgICAgICAgb2ZmPy4oKTsgb2ZmID0gbnVsbDtcbiAgICAgICAgaWYgKHJlYWRTaWQpIHJlYWRpbmcuZHJvcChyZWFkU2lkLCBrZXkpO1xuICAgICAgICByZWFkU2lkID0gc2lkO1xuICAgICAgICB2aWV3LnZhbHVlID0gbnVsbDtcbiAgICAgICAgLy8gd2F0Y2ggY2FsbHMgYmFjayBhdCBvbmNlIHdpdGggdGhlIGZlZWRzIG5vdzogbm8gc2VwYXJhdGUgZ2V0LlxuICAgICAgICBpZiAoc2lkKSBvZmYgPSBtdS5mZWVkcy53YXRjaCgodikgPT4geyB2aWV3LnZhbHVlID0gdjsgfSwgc2lkKTtcbiAgICAgIH0sIHsgaW1tZWRpYXRlOiB0cnVlIH0pO1xuXG4gICAgICBjb25zdCBzb2xvID0gY29tcHV0ZWQoKCkgPT4gc29sb09mKHByb3BzLnBhcmFtcyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpO1xuICAgICAgY29uc3QgbGFiZWxzID0gY29tcHV0ZWQoKCkgPT4gbGFiZWxzT2Yodmlldy52YWx1ZSwgc29sby52YWx1ZSkpO1xuICAgICAgY29uc3Qgc2VsID0gcmVmKCcnKTtcbiAgICAgIHdhdGNoKGxhYmVscywgKGxzKSA9PiB7IHNlbC52YWx1ZSA9IGtlZXBTZWxlY3Rpb24obHMsIHNlbC52YWx1ZSk7IH0sIHsgaW1tZWRpYXRlOiB0cnVlIH0pO1xuXG4gICAgICBjb25zdCBsaW5lcyA9IGNvbXB1dGVkPEZlZWRMaW5lVmlld1tdPigoKSA9PiAoc2VsLnZhbHVlID8gdmlldy52YWx1ZT8ubGluZXNbc2VsLnZhbHVlXSA/PyBbXSA6IFtdKSk7XG4gICAgICBjb25zdCBzZWFyY2hpbmcgPSByZWYoZmFsc2UpLCBxID0gcmVmKCcnKSwgdGltZXMgPSByZWYoZmFsc2UpO1xuICAgICAgY29uc3Qgc2hvd24gPSBjb21wdXRlZCgoKSA9PiBmaWx0ZXJMaW5lcyhsaW5lcy52YWx1ZSwgcS52YWx1ZSkpO1xuXG4gICAgICBjb25zdCBib3ggPSByZWY8SFRNTEVsZW1lbnQgfCBudWxsPihudWxsKTtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IHJlZjxIVE1MSW5wdXRFbGVtZW50IHwgbnVsbD4obnVsbCk7XG4gICAgICBjb25zdCB0YWlsID0gcmVmPFRhaWw+KG5ld1RhaWwoKSk7XG4gICAgICBjb25zdCBzY3JvbGxFbmQgPSAoKSA9PiBuZXh0VGljaygoKSA9PiB7IGlmIChib3gudmFsdWUpIGJveC52YWx1ZS5zY3JvbGxUb3AgPSBib3gudmFsdWUuc2Nyb2xsSGVpZ2h0OyB9KTtcbiAgICAgIC8qKiBUZWxsIHRoZSBob3N0IHdoYXQgdGhpcyBwYW5lbCByZWFkczogdGhlIHNlbGVjdGVkIGZlZWQgd2hpbGUgYXQgaXRzIGVuZCAodGhhdCBtYXJrcyBpdCByZWFkKSwgZWxzZSBub3RoaW5nLiAqL1xuICAgICAgY29uc3QgcmVwb3J0ID0gKCkgPT4geyBpZiAocHJvcHMuc2lkKSByZWFkaW5nLnNldChwcm9wcy5zaWQsIGtleSwgcmVhZGluZ09mKHNlbC52YWx1ZSwgdGFpbC52YWx1ZS5hdEVuZCkpOyB9O1xuICAgICAgd2F0Y2goW3NlbCwgc2hvd25dLCAoKSA9PiB7XG4gICAgICAgIHRhaWwudmFsdWUgPSBzdGVwVGFpbCh0YWlsLnZhbHVlLCBzZWwudmFsdWUsIHNob3duLnZhbHVlKTtcbiAgICAgICAgaWYgKHRhaWwudmFsdWUuYXRFbmQpIHNjcm9sbEVuZCgpO1xuICAgICAgICByZXBvcnQoKTtcbiAgICAgIH0sIHsgaW1tZWRpYXRlOiB0cnVlIH0pO1xuICAgICAgd2F0Y2goKCkgPT4gcHJvcHMuc2lkLCByZXBvcnQpO1xuICAgICAgY29uc3Qgc2V0QXRFbmQgPSAoYXRFbmQ6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgaWYgKGF0RW5kID09PSB0YWlsLnZhbHVlLmF0RW5kKSByZXR1cm47XG4gICAgICAgIHRhaWwudmFsdWUgPSB7IC4uLnRhaWwudmFsdWUsIGF0RW5kLCBmcmVzaDogYXRFbmQgPyAwIDogdGFpbC52YWx1ZS5mcmVzaCB9O1xuICAgICAgICByZXBvcnQoKTtcbiAgICAgIH07XG4gICAgICBjb25zdCBvblNjcm9sbCA9ICgpID0+IHsgaWYgKGJveC52YWx1ZT8uY2xpZW50SGVpZ2h0KSBzZXRBdEVuZChuZWFyRW5kKGJveC52YWx1ZSkpOyB9O1xuICAgICAgY29uc3QgdG9FbmQgPSAoKSA9PiB7IHNldEF0RW5kKHRydWUpOyBzY3JvbGxFbmQoKTsgfTtcblxuICAgICAgLy8gQSBwYW5lbCBoaWRkZW4gYmVoaW5kIGFub3RoZXIgdGFiIGhhcyBubyBoZWlnaHQ7IHNob3duIGFnYWluIGF0IHRoZSBlbmQsIGl0IGdvZXMgYmFjayB0byB0aGUgZW5kLlxuICAgICAgbGV0IGhpZGRlbiA9IGZhbHNlO1xuICAgICAgY29uc3Qgcm8gPSB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgPT09ICd1bmRlZmluZWQnID8gbnVsbCA6IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiB7XG4gICAgICAgIGNvbnN0IGIgPSBib3gudmFsdWU7XG4gICAgICAgIGlmICghYikgcmV0dXJuO1xuICAgICAgICBpZiAoIWIuY2xpZW50SGVpZ2h0KSB7IGhpZGRlbiA9IHRydWU7IHJldHVybjsgfVxuICAgICAgICBpZiAoaGlkZGVuICYmIHRhaWwudmFsdWUuYXRFbmQpIGIuc2Nyb2xsVG9wID0gYi5zY3JvbGxIZWlnaHQ7XG4gICAgICAgIGhpZGRlbiA9IGZhbHNlO1xuICAgICAgfSk7XG4gICAgICB3YXRjaChib3gsIChiLCB3YXMpID0+IHsgaWYgKHdhcykgcm8/LnVub2JzZXJ2ZSh3YXMpOyBpZiAoYikgcm8/Lm9ic2VydmUoYik7IH0pO1xuXG4gICAgICBjb25zdCB0YWJzID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxFbGVtZW50PigpO1xuICAgICAgY29uc3QgdGFiS2V5ID0gKGU6IEtleWJvYXJkRXZlbnQsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBqID0gdGFiVGFyZ2V0KGUua2V5LCBpLCBsYWJlbHMudmFsdWUubGVuZ3RoKTtcbiAgICAgICAgaWYgKGogPCAwKSByZXR1cm47XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgc2VsLnZhbHVlID0gbGFiZWxzLnZhbHVlW2pdO1xuICAgICAgICBuZXh0VGljaygoKSA9PiB0YWJzLmdldChzZWwudmFsdWUpPy5mb2N1cygpKTtcbiAgICAgIH07XG4gICAgICBjb25zdCB0b2dnbGVTZWFyY2ggPSAoKSA9PiB7XG4gICAgICAgIHNlYXJjaGluZy52YWx1ZSA9ICFzZWFyY2hpbmcudmFsdWU7XG4gICAgICAgIGlmICghc2VhcmNoaW5nLnZhbHVlKSBxLnZhbHVlID0gJyc7XG4gICAgICAgIGVsc2UgbmV4dFRpY2soKCkgPT4gc2VhcmNoLnZhbHVlPy5mb2N1cygpKTtcbiAgICAgIH07XG4gICAgICBjb25zdCBjbGVhciA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3Qgc2lkID0gcHJvcHMuc2lkLCBsYWJlbCA9IHNlbC52YWx1ZTtcbiAgICAgICAgaWYgKCFzaWQgfHwgIWxhYmVsKSByZXR1cm47XG4gICAgICAgIGlmIChhd2FpdCBtdS51aS5jb25maXJtKHsgdGl0bGU6IENPUFkuY29uZmlybUNsZWFyKGxhYmVsKSwgY29uZmlybTogQ09QWS5jbGVhciwgZGFuZ2VyOiB0cnVlIH0pKSBtdS5mZWVkcy5jbGVhcihsYWJlbCwgc2lkKTtcbiAgICAgIH07XG4gICAgICAvKiogUnVsZXMgYW5kIFwiQWRkIGEgZmVlZFwiIG9wZW4gU2V0dGluZ3MgXHUyMTkyIEZlZWRzLiAqL1xuICAgICAgY29uc3QgZWRpdFJ1bGVzID0gKCkgPT4gbXUuY29tbWFuZHMucnVuKCdzZXR0aW5ncy5vcGVuJywgJ2ZlZWRzJyk7XG4gICAgICBjb25zdCBwb3BPdXQgPSAoKSA9PiB7XG4gICAgICAgIGlmICghc2VsLnZhbHVlKSByZXR1cm47XG4gICAgICAgIG11LnBhbmVscy5vcGVuKCdmZWVkJywgeyBmZWVkOiBzZWwudmFsdWUsIGluc3RhbmNlOiBzZWwudmFsdWUgfSwgeyB0aXRsZTogQ09QWS5wb3BUaXRsZShzZWwudmFsdWUpLCAuLi4ocHJvcHMuc2lkID8geyBzaWQ6IHByb3BzLnNpZCB9IDoge30pIH0pO1xuICAgICAgfTtcblxuICAgICAgLy8gU3RvcCByZWFkaW5nIGhlcmUgKHRoZSBob3N0IGFsc28gcmVzZXRzIGl0cyBvd24gc3RhdGUgb24gZGlzcG9zZSkuIEFub3RoZXIgcGFuZWwgc3RpbGwgcmVhZGluZyBrZWVwcyBpdC5cbiAgICAgIG9uQmVmb3JlVW5tb3VudCgoKSA9PiB7XG4gICAgICAgIHJvPy5kaXNjb25uZWN0KCk7XG4gICAgICAgIG9mZj8uKCk7IG9mZiA9IG51bGw7XG4gICAgICAgIGlmIChyZWFkU2lkKSByZWFkaW5nLmRyb3AocmVhZFNpZCwga2V5KTtcbiAgICAgICAgcmVhZFNpZCA9IG51bGw7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgdG9vbCA9IChsYWJlbDogc3RyaW5nLCBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIG9uID0gZmFsc2UpID0+XG4gICAgICAgIGgoJ2J1dHRvbicsIHsgdHlwZTogJ2J1dHRvbicsIGNsYXNzOiBbYy5jbWQsIHsgW2Mub25dOiBvbiB9XSwgLi4uYXR0cnMgfSwgbGFiZWwpO1xuICAgICAgY29uc3Qgc3Bhbk9mID0gKHM6IEZlZWRMaW5lVmlld1snc3BhbnMnXVtudW1iZXJdLCBrOiBudW1iZXIpOiBWTm9kZSA9PiAocy5ocmVmXG4gICAgICAgID8gaCgnYScsIHsga2V5OiBrLCBocmVmOiBzLmhyZWYsIHRhcmdldDogJ19ibGFuaycsIHJlbDogJ25vb3BlbmVyIG5vcmVmZXJyZXInLCBjbGFzczogcy5jbHMsIHN0eWxlOiBzLnN0eWxlIH0sIHMudGV4dClcbiAgICAgICAgOiBoKCdzcGFuJywgeyBrZXk6IGssIGNsYXNzOiBzLmNscywgc3R5bGU6IHMuc3R5bGUgfSwgcy50ZXh0KSk7XG5cbiAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGxzID0gbGFiZWxzLnZhbHVlLCBjdXIgPSBzZWwudmFsdWU7XG4gICAgICAgIGlmICghbHMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGgoJ2RpdicsIHsgY2xhc3M6ICdtdS1mZWVkcycsICdkYXRhLXRlc3RpZCc6ICdmZWVkcy1wYW5lbCcgfSwgW1xuICAgICAgICAgICAgaCgnZGl2JywgeyBjbGFzczogJ2ludHJvJyB9LCBbaCgnYnV0dG9uJywgeyB0eXBlOiAnYnV0dG9uJywgY2xhc3M6IFtjLmNtZCwgJ3ByaW1hcnknLCAnbWFrZSddLCAnZGF0YS10ZXN0aWQnOiAnZmVlZHMtYWRkJywgb25DbGljazogZWRpdFJ1bGVzIH0sIENPUFkuYWRkRmVlZCldKSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBiYXIgPSBoKCdkaXYnLCB7IGNsYXNzOiAnZmJhcicgfSwgW1xuICAgICAgICAgIHNvbG8udmFsdWVcbiAgICAgICAgICAgID8gaCgnc3BhbicsIHsgY2xhc3M6ICdzb2xvJyB9LCBzb2xvLnZhbHVlKVxuICAgICAgICAgICAgOiBoKCdkaXYnLCB7IGNsYXNzOiAnZnRhYnMnLCByb2xlOiAndGFibGlzdCcsICdhcmlhLWxhYmVsJzogQ09QWS50aXRsZSB9LCBscy5tYXAoKGwsIGkpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbiA9IHVucmVhZE9mKHZpZXcudmFsdWUsIGwsIGN1cik7XG4gICAgICAgICAgICAgIHJldHVybiBoKCdidXR0b24nLCB7XG4gICAgICAgICAgICAgICAga2V5OiBsLCB0eXBlOiAnYnV0dG9uJywgcm9sZTogJ3RhYicsIGNsYXNzOiBbJ2Z0YWInLCB7IG9uOiBsID09PSBjdXIgfV0sICdkYXRhLXRlc3RpZCc6ICdmZWVkLXRhYicsXG4gICAgICAgICAgICAgICAgcmVmOiAoZWw6IHVua25vd24pID0+IHsgaWYgKGVsKSB0YWJzLnNldChsLCBlbCBhcyBIVE1MRWxlbWVudCk7IGVsc2UgdGFicy5kZWxldGUobCk7IH0sXG4gICAgICAgICAgICAgICAgJ2FyaWEtc2VsZWN0ZWQnOiBsID09PSBjdXIsIHRhYmluZGV4OiBsID09PSBjdXIgPyAwIDogLTEsICdhcmlhLWxhYmVsJzogdGFiTGFiZWwobCwgbiksXG4gICAgICAgICAgICAgICAgb25DbGljazogKCkgPT4geyBzZWwudmFsdWUgPSBsOyB9LCBvbktleWRvd246IChlOiBLZXlib2FyZEV2ZW50KSA9PiB0YWJLZXkoZSwgaSksXG4gICAgICAgICAgICAgIH0sIFtsLCBuID8gaCgnc3BhbicsIHsgY2xhc3M6IFsnZmJhZGdlJywgYy5jb3VudF0sICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9LCBTdHJpbmcobikpIDogbnVsbF0pO1xuICAgICAgICAgICAgfSkpLFxuICAgICAgICAgIGgoJ3NwYW4nLCB7IGNsYXNzOiAndG9vbHMnLCByb2xlOiAndG9vbGJhcicsICdhcmlhLWxhYmVsJzogJ0ZlZWQgdG9vbHMnIH0sIFtcbiAgICAgICAgICAgIHRvb2woQ09QWS5zZWFyY2gsIHsgJ2FyaWEtcHJlc3NlZCc6IHNlYXJjaGluZy52YWx1ZSwgJ2FyaWEtbGFiZWwnOiAnU2VhcmNoIHRoaXMgZmVlZCcsIHRpdGxlOiAnc2VhcmNoJywgb25DbGljazogdG9nZ2xlU2VhcmNoIH0sIHNlYXJjaGluZy52YWx1ZSksXG4gICAgICAgICAgICB0b29sKENPUFkudGltZXMsIHsgJ2FyaWEtcHJlc3NlZCc6IHRpbWVzLnZhbHVlLCAnYXJpYS1sYWJlbCc6ICdUaW1lc3RhbXBzJywgdGl0bGU6ICd0aW1lc3RhbXBzJywgb25DbGljazogKCkgPT4geyB0aW1lcy52YWx1ZSA9ICF0aW1lcy52YWx1ZTsgfSB9LCB0aW1lcy52YWx1ZSksXG4gICAgICAgICAgICAhc29sby52YWx1ZSAmJiBjdXIgPyB0b29sKENPUFkucG9wT3V0LCB7IHRpdGxlOiAnb3duIHBhbmVsJywgJ2FyaWEtbGFiZWwnOiBgT3BlbiAke2N1cn0gaW4gaXRzIG93biBwYW5lbGAsICdkYXRhLXRlc3RpZCc6ICdmZWVkLXBvcG91dCcsIG9uQ2xpY2s6IHBvcE91dCB9KSA6IG51bGwsXG4gICAgICAgICAgICB0b29sKENPUFkucnVsZXMsIHsgJ2FyaWEtbGFiZWwnOiAnRWRpdCBmZWVkIHJ1bGVzJywgdGl0bGU6ICdydWxlcycsIG9uQ2xpY2s6IGVkaXRSdWxlcyB9KSxcbiAgICAgICAgICAgIGN1ciA/IHRvb2woQ09QWS5jbGVhciwgeyB0aXRsZTogJ2NsZWFyJywgJ2FyaWEtbGFiZWwnOiBgQ2xlYXIgJHtjdXJ9IGZlZWRgLCAnZGF0YS10ZXN0aWQnOiAnZmVlZC1jbGVhcicsIG9uQ2xpY2s6ICgpID0+IHsgdm9pZCBjbGVhcigpOyB9IH0pIDogbnVsbCxcbiAgICAgICAgICBdKSxcbiAgICAgICAgXSk7XG4gICAgICAgIGNvbnN0IHNlYXJjaFJvdyA9IHNlYXJjaGluZy52YWx1ZSA/IGgoJ2RpdicsIHsgY2xhc3M6ICdmc2VhcmNoJyB9LCBbXG4gICAgICAgICAgaCgnaW5wdXQnLCB7XG4gICAgICAgICAgICByZWY6IHNlYXJjaCwgY2xhc3M6IFtjLmZpZWxkLCBjLnBsYWNlaG9sZGVyXSwgdmFsdWU6IHEudmFsdWUsIHBsYWNlaG9sZGVyOiBDT1BZLnNlYXJjaEluKGN1ciksICdhcmlhLWxhYmVsJzogQ09QWS5zZWFyY2hJbihjdXIpLFxuICAgICAgICAgICAgJ2RhdGEtdGVzdGlkJzogJ2ZlZWQtc2VhcmNoJyxcbiAgICAgICAgICAgIG9uSW5wdXQ6IChlOiBFdmVudCkgPT4geyBxLnZhbHVlID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlOyB9LFxuICAgICAgICAgICAgb25LZXlkb3duOiAoZTogS2V5Ym9hcmRFdmVudCkgPT4geyBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7IHNlYXJjaGluZy52YWx1ZSA9IGZhbHNlOyBxLnZhbHVlID0gJyc7IH0gfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBoKCdzcGFuJywgeyBjbGFzczogJ2NudCcsICdhcmlhLWxpdmUnOiAncG9saXRlJyB9LCBbU3RyaW5nKHNob3duLnZhbHVlLmxlbmd0aCksICcgJywgaCgnc3BhbicsIHsgY2xhc3M6ICdzci1vbmx5JyB9LCAnbWF0Y2hpbmcgbGluZXMnKV0pLFxuICAgICAgICBdKSA6IG51bGw7XG4gICAgICAgIGNvbnN0IHJvd3MgPSBzaG93bi52YWx1ZS5tYXAoKGwpID0+IGgoJ2RpdicsIHsga2V5OiBsLmlkLCBjbGFzczogWydmbGluZScsIGwucm93Q2xzXSwgJ2RhdGEtdGVzdGlkJzogJ2ZlZWQtbGluZScgfSwgW1xuICAgICAgICAgIHRpbWVzLnZhbHVlID8gaCgnc3BhbicsIHsgY2xhc3M6ICd0cycgfSwgaGhtbXNzKGwudHMpKSA6IG51bGwsXG4gICAgICAgICAgLi4ubC5zcGFucy5tYXAoc3Bhbk9mKSxcbiAgICAgICAgXSkpO1xuICAgICAgICBjb25zdCBwID0gcGlsbE9mKHRhaWwudmFsdWUpO1xuICAgICAgICBjb25zdCBwaWxsID0gcCA/IGgoJ2J1dHRvbicsIHtcbiAgICAgICAgICB0eXBlOiAnYnV0dG9uJywgY2xhc3M6IFsnbGF0ZXN0JywgeyBxdWlldDogcC5xdWlldCB9XSwgJ2RhdGEtdGVzdGlkJzogJ2ZlZWQtbGF0ZXN0Jywgb25DbGljazogdG9FbmQsXG4gICAgICAgICAgLi4uKHAucXVpZXQgPyB7ICdhcmlhLWxhYmVsJzogQ09QWS5qdW1wTGF0ZXN0IH0gOiB7fSksXG4gICAgICAgIH0sIHAudGV4dCkgOiBudWxsO1xuICAgICAgICByZXR1cm4gaCgnZGl2JywgeyBjbGFzczogJ211LWZlZWRzJywgJ2RhdGEtdGVzdGlkJzogJ2ZlZWRzLXBhbmVsJyB9LCBbXG4gICAgICAgICAgYmFyLCBzZWFyY2hSb3csXG4gICAgICAgICAgaCgnZGl2JywgeyBjbGFzczogJ2xpbmVzLXdyYXAnIH0sIFtcbiAgICAgICAgICAgIGgoJ2RpdicsIHtcbiAgICAgICAgICAgICAgcmVmOiBib3gsIGNsYXNzOiAnZmxpbmVzJywgcm9sZTogJ2xvZycsICdhcmlhLWxpdmUnOiAnb2ZmJywgdGFiaW5kZXg6IDAsICdhcmlhLWxhYmVsJzogYCR7Y3VyfSBmZWVkYCwgJ2RhdGEtZm9jdXMtcmVnaW9uJzogJ2ZlZWRzJyxcbiAgICAgICAgICAgICAgb25TY3JvbGwsIG9uV2hlZWw6IChlOiBXaGVlbEV2ZW50KSA9PiB7IGlmIChlLmRlbHRhWSA8IDApIHNldEF0RW5kKGZhbHNlKTsgfSxcbiAgICAgICAgICAgIH0sIFsuLi5yb3dzLCBzaG93bi52YWx1ZS5sZW5ndGggPyBudWxsIDogaCgncCcsIHsgY2xhc3M6IFtjLmVtcHR5LCAnZmVtcHR5J10gfSwgcS52YWx1ZS50cmltKCkgPyBDT1BZLm5vTWF0Y2hlcyA6IENPUFkuZW1wdHkpXSksXG4gICAgICAgICAgICBwaWxsLFxuICAgICAgICAgIF0pLFxuICAgICAgICBdKTtcbiAgICAgIH07XG4gICAgfSxcbiAgfSk7XG59XG4iLCAiLyoqXG4gKiBUaGUgcHVyZSBwYXJ0cyBvZiB0aGUgRmVlZHMgcGFuZWw6IGNvcHksIENTUywgdGFiIGtleXMsIHRpbWVzdGFtcHMsIHNlYXJjaCwgdGhlIGxhdGVzdCBwaWxsLCB3aGF0IHRoZSBwYW5lbFxuICogdGVsbHMgdGhlIGhvc3QgaXQgaXMgcmVhZGluZywgYW5kIHRoZSBmaXJzdC1saW5lIHdhdGNoZXIuIE5vIFZ1ZSBhbmQgbm8gRE9NIGhlcmUsIHNvIHRlc3RzLyoudGVzdC5tanMgaW1wb3J0XG4gKiB0aGlzIGZpbGUgZGlyZWN0bHkuXG4gKi9cbmltcG9ydCB0eXBlIHsgRGlzcG9zZSwgRmVlZExpbmVWaWV3LCBGZWVkc1ZpZXcsIE11IH0gZnJvbSAnQG11Y2xpZW50L3Nkayc7XG5cbi8qKiBWaXNpYmxlIGNvcHkuICovXG5leHBvcnQgY29uc3QgQ09QWSA9IHtcbiAgc2VhcmNoOiAnU2VhcmNoJywgdGltZXM6ICdUaW1lcycsIHJ1bGVzOiAnUnVsZXMnLCBwb3BPdXQ6ICdQb3Agb3V0JywgY2xlYXI6ICdDbGVhcicsIGFkZEZlZWQ6ICdBZGQgYSBmZWVkJyxcbiAgZW1wdHk6ICdFbXB0eS4nLCBub01hdGNoZXM6ICdObyBtYXRjaGVzLicsXG4gIHRpdGxlOiAnRmVlZHMnLCBmZWVkVGl0bGU6ICdGZWVkJyxcbiAgLyoqIFRoZSBwb3BwZWQtb3V0IGZlZWQncyB0YWIuICovXG4gIHBvcFRpdGxlOiAobGFiZWw6IHN0cmluZykgPT4gYEZlZWQ6ICR7bGFiZWx9YCxcbiAgY29uZmlybUNsZWFyOiAobGFiZWw6IHN0cmluZykgPT4gYENsZWFyICR7bGFiZWx9P2AsXG4gIHNlYXJjaEluOiAobGFiZWw6IHN0cmluZykgPT4gYFNlYXJjaCAke2xhYmVsfWAsXG4gIGxhdGVzdDogKG46IG51bWJlcikgPT4gYCR7bn0gbmV3IGxpbmUke24gPT09IDEgPyAnJyA6ICdzJ30gXHUyMTkzYCxcbiAganVtcExhdGVzdDogJ0p1bXAgdG8gdGhlIGxhdGVzdCBsaW5lJyxcbn07XG5cbi8qKiBFdmVyeSBydWxlIGlzIHNjb3BlZCB0byB0aGlzIGV4dGVuc2lvbidzIHBhbmVscyAoYG11LnVpLnN0eWxlYCBwdXRzIHRoZW0gaW4gYEBsYXllciBleHQuZmVlZHNgKS4gKi9cbmV4cG9ydCBjb25zdCBTQ09QRSA9ICcuZXh0LXBhbmVsW2RhdGEtZXh0PVwiZmVlZHNcIl0nO1xuXG4vKiogVG9rZW5zIG9ubHkgKHN0eWxlIGJpYmxlKS4gQ29udHJvbHMgYXJlIHRoZSBob3N0J3MgYHNoLSpgIHByaW1pdGl2ZXM7IHRoaXMgaXMgdGhlIGxheW91dCBhcm91bmQgdGhlbS4gKi9cbmV4cG9ydCBjb25zdCBGRUVEU19DU1MgPSBbXG4gICcubXUtZmVlZHMgeyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBoZWlnaHQ6IDEwMCU7IG1pbi1oZWlnaHQ6IDA7IGJhY2tncm91bmQ6IHZhcigtLWJnLWVsZXYpOyB9JyxcbiAgJy5tdS1mZWVkcyAuZmJhciB7IGRpc3BsYXk6IGZsZXg7IGZsZXgtd3JhcDogd3JhcDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA2cHg7IHBhZGRpbmc6IDRweCA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1hY2NlbnQpOyBmbGV4OiAwIDAgYXV0bzsgfScsXG4gICcubXUtZmVlZHMgLmZ0YWJzIHsgZGlzcGxheTogZmxleDsgZ2FwOiAycHg7IGZsZXgtd3JhcDogd3JhcDsgZmxleDogMSAxIGF1dG87IH0nLFxuICAnLm11LWZlZWRzIC5zb2xvIHsgZmxleDogMTsgbWluLXdpZHRoOiAwOyBjb2xvcjogdmFyKC0tYWNjZW50LWJyaWdodCk7IGZvbnQtc2l6ZTogLjdyZW07IGxldHRlci1zcGFjaW5nOiAuMTJlbTsgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IH0nLFxuICAnLm11LWZlZWRzIC5mdGFiIHsgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogLjZjaDsgYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiAwOyBib3JkZXItcmFkaXVzOiAwOyBjb2xvcjogdmFyKC0tZmctZGltKTsgZm9udC1mYW1pbHk6IGluaGVyaXQ7IGZvbnQtc2l6ZTogLjY0cmVtOyBsZXR0ZXItc3BhY2luZzogLjE0ZW07IHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7IHBhZGRpbmc6IDJweCAuOGNoOyBtaW4taGVpZ2h0OiAyNHB4OyBjdXJzb3I6IHBvaW50ZXI7IHRyYW5zaXRpb246IGNvbG9yIC4xMnMgZWFzZSwgYmFja2dyb3VuZC1jb2xvciAuMTJzIGVhc2U7IH0nLFxuICAnLm11LWZlZWRzIC5mdGFiOmhvdmVyIHsgY29sb3I6IHZhcigtLWZnKTsgYmFja2dyb3VuZDogdmFyKC0tdGludC10b2dnbGUpOyB9JyxcbiAgJy5tdS1mZWVkcyAuZnRhYi5vbiB7IGNvbG9yOiB2YXIoLS1iZy1kZWVwKTsgYmFja2dyb3VuZDogdmFyKC0tYWNjZW50KTsgfScsXG4gICcubXUtZmVlZHMgLnRvb2xzIHsgZGlzcGxheTogZmxleDsgZmxleC13cmFwOiB3cmFwOyBnYXA6IDJweDsgZmxleDogMCAxIGF1dG87IG1hcmdpbi1sZWZ0OiBhdXRvOyB9JyxcbiAgJy5tdS1mZWVkcyAuZnNlYXJjaCB7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4OyBwYWRkaW5nOiA0cHggOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYm9yZGVyKTsgZmxleDogMCAwIGF1dG87IH0nLFxuICAnLm11LWZlZWRzIC5mc2VhcmNoIGlucHV0IHsgZmxleDogMTsgbWluLXdpZHRoOiAwOyB9JyxcbiAgJy5tdS1mZWVkcyAuY250IHsgY29sb3I6IHZhcigtLWZnLWRpbSk7IGZvbnQtc2l6ZTogLjcycmVtOyB9JyxcbiAgJy5tdS1mZWVkcyAubGluZXMtd3JhcCB7IHBvc2l0aW9uOiByZWxhdGl2ZTsgZmxleDogMTsgbWluLWhlaWdodDogMDsgZGlzcGxheTogZmxleDsgfScsXG4gICcubXUtZmVlZHMgLmZsaW5lcyB7IGZsZXg6IDE7IG92ZXJmbG93LXk6IGF1dG87IHBhZGRpbmc6IDZweCAxMHB4OyBsaW5lLWhlaWdodDogdmFyKC0tc2hlbGwtbGluZS1oZWlnaHQsIDEuNSk7IH0nLFxuICAnLm11LWZlZWRzIC5mbGluZSB7IHdoaXRlLXNwYWNlOiBwcmUtd3JhcDsgd29yZC1icmVhazogYnJlYWstd29yZDsgfScsXG4gICcubXUtZmVlZHMgLnRzIHsgY29sb3I6IHZhcigtLWZnLWZhaW50KTsgbWFyZ2luLXJpZ2h0OiAuOGNoOyBmb250LXNpemU6IC44MmVtOyB1c2VyLXNlbGVjdDogbm9uZTsgfScsXG4gICcubXUtZmVlZHMgLmZlbXB0eSB7IHBhZGRpbmc6IDEwcHggMDsgbWFyZ2luOiAwOyBjb2xvcjogdmFyKC0tZmctZmFpbnQpOyBmb250LXN0eWxlOiBub3JtYWw7IGZvbnQtc2l6ZTogLjY0cmVtOyBsZXR0ZXItc3BhY2luZzogLjE0ZW07IHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7IH0nLFxuICAnLm11LWZlZWRzIC5sYXRlc3QgeyBwb3NpdGlvbjogYWJzb2x1dGU7IHJpZ2h0OiAxNHB4OyBib3R0b206IDEwcHg7IHotaW5kZXg6IDU7IGJhY2tncm91bmQ6IHZhcigtLWFjY2VudCk7IGJvcmRlcjogMDsgYm9yZGVyLXJhZGl1czogMDsgY29sb3I6IHZhcigtLWJnLWRlZXApOyBmb250LWZhbWlseTogaW5oZXJpdDsgZm9udC1zaXplOiAuNjRyZW07IGxldHRlci1zcGFjaW5nOiAuMTRlbTsgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTsgcGFkZGluZzogM3B4IDEwcHg7IG1pbi1oZWlnaHQ6IDI0cHg7IGN1cnNvcjogcG9pbnRlcjsgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAuMTJzIGVhc2U7IH0nLFxuICAnLm11LWZlZWRzIC5sYXRlc3QucXVpZXQgeyBwYWRkaW5nOiAzcHggN3B4OyB9JyxcbiAgJy5tdS1mZWVkcyAubGF0ZXN0OmhvdmVyIHsgYmFja2dyb3VuZDogdmFyKC0tYWNjZW50LWJyaWdodCk7IH0nLFxuICAnLm11LWZlZWRzIC5pbnRybyB7IHBhZGRpbmc6IDEycHg7IGNvbG9yOiB2YXIoLS1mZy1kaW0pOyBmb250LXNpemU6IC44cmVtOyBsaW5lLWhlaWdodDogMS41OyB9JyxcbiAgJ0BtZWRpYSAobWF4LXdpZHRoOiA0MjBweCkgeyAubXUtZmVlZHMgLmZ0YWIsIC5tdS1mZWVkcyAubGF0ZXN0IHsgbWluLWhlaWdodDogMzJweDsgfSB9Jyxcbl0ubWFwKChyKSA9PiAoci5zdGFydHNXaXRoKCdAbWVkaWEnKSA/IHIucmVwbGFjZSgvXFwubXUtZmVlZHMvZywgYCR7U0NPUEV9IC5tdS1mZWVkc2ApIDogYCR7U0NPUEV9ICR7cn1gKSkuam9pbignXFxuJyk7XG5cbi8qKiBgcGFyYW1zLmZlZWRgIG9mIHRoZSBwb3BwZWQtb3V0IGBmZWVkYCBwYW5lbCwgJycgZm9yIHRoZSB0YWJiZWQgYGZlZWRzYCBwYW5lbC4gKi9cbmV4cG9ydCBjb25zdCBzb2xvT2YgPSAocGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHN0cmluZyA9PiAodHlwZW9mIHBhcmFtcz8uZmVlZCA9PT0gJ3N0cmluZycgPyBwYXJhbXMuZmVlZCA6ICcnKTtcblxuLyoqIFRoZSB0YWJzIHRvIHNob3c6IHRoZSBzb2xvIGZlZWQgYWxvbmUsIGVsc2UgdGhlIGhvc3QncyBvcmRlcmVkIGxhYmVscy4gKi9cbmV4cG9ydCBjb25zdCBsYWJlbHNPZiA9ICh2aWV3OiBGZWVkc1ZpZXcgfCBudWxsLCBzb2xvOiBzdHJpbmcpOiBzdHJpbmdbXSA9PiAoc29sbyA/IFtzb2xvXSA6IHZpZXcgPyBbLi4udmlldy5sYWJlbHNdIDogW10pO1xuXG4vKiogS2VlcCB0aGUgc2VsZWN0aW9uIHdoaWxlIGl0cyBmZWVkIGV4aXN0cywgZWxzZSB0aGUgZmlyc3Qgb25lICgnJyB3aGVuIG5vbmUpLiAqL1xuZXhwb3J0IGNvbnN0IGtlZXBTZWxlY3Rpb24gPSAobGFiZWxzOiBzdHJpbmdbXSwgc2VsOiBzdHJpbmcpOiBzdHJpbmcgPT4gKGxhYmVscy5pbmNsdWRlcyhzZWwpID8gc2VsIDogbGFiZWxzWzBdID8/ICcnKTtcblxuLyoqIFRoZSB0YWIgaW5kZXggYSBrZXkgbW92ZXMgdG8gKHJvdmluZyB0YWJpbmRleDogYXJyb3dzIHdyYXAsIEhvbWUsIEVuZCksIG9yIC0xIGZvciBhbnkgb3RoZXIga2V5LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRhYlRhcmdldChrZXk6IHN0cmluZywgaTogbnVtYmVyLCBuOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAobiA8PSAwKSByZXR1cm4gLTE7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnQXJyb3dSaWdodCc6IHJldHVybiAoaSArIDEpICUgbjtcbiAgICBjYXNlICdBcnJvd0xlZnQnOiByZXR1cm4gKGkgLSAxICsgbikgJSBuO1xuICAgIGNhc2UgJ0hvbWUnOiByZXR1cm4gMDtcbiAgICBjYXNlICdFbmQnOiByZXR1cm4gbiAtIDE7XG4gICAgZGVmYXVsdDogcmV0dXJuIC0xO1xuICB9XG59XG5cbi8qKiBMb2NhbCBISDpNTTpTUyBmb3IgdGhlIFRpbWVzIGNvbHVtbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoaG1tc3ModHM6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSh0cyksIHAgPSAobjogbnVtYmVyKSA9PiBTdHJpbmcobikucGFkU3RhcnQoMiwgJzAnKTtcbiAgcmV0dXJuIGAke3AoZC5nZXRIb3VycygpKX06JHtwKGQuZ2V0TWludXRlcygpKX06JHtwKGQuZ2V0U2Vjb25kcygpKX1gO1xufVxuXG4vKiogVGhlIGxpbmVzIG1hdGNoaW5nIGEgc2VhcmNoIChjYXNlLWluc2Vuc2l0aXZlIHN1YnN0cmluZyBvZiB0aGUgcGxhaW4gdGV4dCk7IGFsbCBvZiB0aGVtIGZvciBhbiBlbXB0eSBxdWVyeS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJMaW5lcyhsaW5lczogRmVlZExpbmVWaWV3W10sIHE6IHN0cmluZyk6IEZlZWRMaW5lVmlld1tdIHtcbiAgY29uc3QgbmVlZGxlID0gcS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuIG5lZWRsZSA/IGxpbmVzLmZpbHRlcigobCkgPT4gbC50ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobmVlZGxlKSkgOiBsaW5lcztcbn1cblxuLyoqIEEgdGFiJ3MgdW5yZWFkIGJhZGdlOiBub25lIG9uIHRoZSBzZWxlY3RlZCB0YWIuICovXG5leHBvcnQgY29uc3QgdW5yZWFkT2YgPSAodmlldzogRmVlZHNWaWV3IHwgbnVsbCwgbGFiZWw6IHN0cmluZywgc2VsOiBzdHJpbmcpOiBudW1iZXIgPT4gKGxhYmVsICE9PSBzZWwgPyB2aWV3Py51bnJlYWRbbGFiZWxdID8/IDAgOiAwKTtcblxuLyoqIFRoZSB0YWIncyBhY2Nlc3NpYmxlIG5hbWUsIHdpdGggaXRzIHVucmVhZCBjb3VudC4gKi9cbmV4cG9ydCBjb25zdCB0YWJMYWJlbCA9IChsYWJlbDogc3RyaW5nLCB1bnJlYWQ6IG51bWJlcik6IHN0cmluZyA9PiAodW5yZWFkID8gYCR7bGFiZWx9LCAke3VucmVhZH0gdW5yZWFkYCA6IGxhYmVsKTtcblxuLyoqIFRydWUgd2hlbiBhIHNjcm9sbCBib3ggaXMgd2l0aGluIDI0cHggb2YgaXRzIGVuZC4gKi9cbmV4cG9ydCBjb25zdCBuZWFyRW5kID0gKGI6IHsgc2Nyb2xsSGVpZ2h0OiBudW1iZXI7IHNjcm9sbFRvcDogbnVtYmVyOyBjbGllbnRIZWlnaHQ6IG51bWJlciB9KTogYm9vbGVhbiA9PiBiLnNjcm9sbEhlaWdodCAtIGIuc2Nyb2xsVG9wIC0gYi5jbGllbnRIZWlnaHQgPCAyNDtcblxuLyoqXG4gKiBXaGF0IHRoZSBwYW5lbCB0ZWxscyB0aGUgaG9zdCBpdCBpcyByZWFkaW5nIChgbXUuZmVlZHMudmlld2luZ2ApOiB0aGUgc2VsZWN0ZWQgZmVlZCB3aGlsZSB5b3UgYXJlIGF0IGl0cyBlbmQsXG4gKiBub3RoaW5nIHdoaWxlIHlvdSBhcmUgc2Nyb2xsZWQgdXAuIExpbmVzIGFycml2aW5nIGluIGEgZmVlZCB5b3UgaGF2ZSBzY3JvbGxlZCBhd2F5IGZyb20gdGhlbiBjb3VudCBhcyB1bnJlYWQsIGFuZFxuICogcmVhY2hpbmcgdGhlIGVuZCBhZ2FpbiBtYXJrcyB0aGVtIHJlYWQuXG4gKi9cbmV4cG9ydCBjb25zdCByZWFkaW5nT2YgPSAoc2VsOiBzdHJpbmcsIGF0RW5kOiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCA9PiAoc2VsICYmIGF0RW5kID8gc2VsIDogbnVsbCk7XG5cbi8qKlxuICogVGhlIGxhdGVzdCBwaWxsJ3MgY291bnRlci4gRWFjaCB1cGRhdGUgZ2l2ZXMgdGhlIHNlbGVjdGlvbiBhbmQgdGhlIHNob3duIGxpbmVzOyBhIHN3aXRjaCBvZiBmZWVkIHJlc2V0cyBpdFxuICogKGFuZCBwdXRzIHlvdSBhdCB0aGUgZW5kKSwgb3RoZXJ3aXNlIGxpbmVzIG5ld2VyIHRoYW4gdGhlIGxhc3Qgb25lIHNlZW4gY291bnQgd2hpbGUgeW91IGFyZSBzY3JvbGxlZCB1cC5cbiAqIENvdW50aW5nIGJ5IGlkIHJhdGhlciB0aGFuIGJ5IGxlbmd0aCBrZWVwcyBpdCByaWdodCBvbmNlIGEgYnVmZmVyIGlzIGF0IGl0cyA1MDAtbGluZSBjYXAuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVGFpbCB7IHNlbDogc3RyaW5nOyBsYXN0SWQ6IG51bWJlcjsgYXRFbmQ6IGJvb2xlYW47IGZyZXNoOiBudW1iZXIgfVxuZXhwb3J0IGNvbnN0IG5ld1RhaWwgPSAoKTogVGFpbCA9PiAoeyBzZWw6ICcnLCBsYXN0SWQ6IC1JbmZpbml0eSwgYXRFbmQ6IHRydWUsIGZyZXNoOiAwIH0pO1xuZXhwb3J0IGZ1bmN0aW9uIHN0ZXBUYWlsKHQ6IFRhaWwsIHNlbDogc3RyaW5nLCBzaG93bjogRmVlZExpbmVWaWV3W10pOiBUYWlsIHtcbiAgY29uc3QgbGFzdElkID0gc2hvd24ubGVuZ3RoID8gc2hvd25bc2hvd24ubGVuZ3RoIC0gMV0uaWQgOiB0Lmxhc3RJZDtcbiAgaWYgKHNlbCAhPT0gdC5zZWwpIHJldHVybiB7IHNlbCwgbGFzdElkLCBhdEVuZDogdHJ1ZSwgZnJlc2g6IDAgfTtcbiAgaWYgKHQuYXRFbmQpIHJldHVybiB7IC4uLnQsIGxhc3RJZCwgZnJlc2g6IDAgfTtcbiAgY29uc3QgYWRkZWQgPSBzaG93bi5yZWR1Y2UoKG4sIGwpID0+IG4gKyAobC5pZCA+IHQubGFzdElkID8gMSA6IDApLCAwKTtcbiAgcmV0dXJuIHsgLi4udCwgbGFzdElkOiBNYXRoLm1heChsYXN0SWQsIHQubGFzdElkKSwgZnJlc2g6IHQuZnJlc2ggKyBhZGRlZCB9O1xufVxuXG4vKiogVGhlIHBpbGw6IG5vbmUgYXQgdGhlIGVuZCwgXCJOIG5ldyBsaW5lcyBcdTIxOTNcIiB3aXRoIG5ld3MsIGEgcXVpZXQgXHUyMTkzIHdoaWxlIHNjcm9sbGVkIHVwIHdpdGhvdXQgbmV3cy4gKi9cbmV4cG9ydCBjb25zdCBwaWxsT2YgPSAodDogVGFpbCk6IG51bGwgfCB7IHF1aWV0OiBib29sZWFuOyB0ZXh0OiBzdHJpbmcgfSA9PlxuICAodC5hdEVuZCA/IG51bGwgOiB0LmZyZXNoID4gMCA/IHsgcXVpZXQ6IGZhbHNlLCB0ZXh0OiBDT1BZLmxhdGVzdCh0LmZyZXNoKSB9IDogeyBxdWlldDogdHJ1ZSwgdGV4dDogJ1x1MjE5MycgfSk7XG5cbi8qKlxuICogVGhlIGZlZWRzIGEgc2Vzc2lvbidzIHBhbmVscyBhcmUgcmVhZGluZy4gVGhlIGhvc3Qga2VlcHMgb25lIGB2aWV3aW5nYCBsYWJlbCBwZXIgc2Vzc2lvbiwgYnV0IHRoZSB0YWJiZWQgcGFuZWwgYW5kXG4gKiBhbnkgbnVtYmVyIG9mIHBvcC1vdXRzIGNhbiBlYWNoIGJlIGF0IHRoZSBlbmQgb2YgYSBkaWZmZXJlbnQgZmVlZC4gRWFjaCBwYW5lbCByZXBvcnRzIGl0cyBvd24gcmVhZGluZ1xuICogKHtAbGluayByZWFkaW5nT2Z9KSB1bmRlciBpdHMgb3duIGtleTsgdGhlIGhvc3QgaXMgdG9sZCB0aGUgbGF0ZXN0IG9uZSB0aGF0IGlzIHN0aWxsIGJlaW5nIHJlYWQgKHdoaWNoIGFsc28gbWFya3NcbiAqIGl0IHJlYWQpLCBhbmQgbm90aGluZyBvbmNlIG5vIHBhbmVsIHJlYWRzIGFueS4gYGRyb3BgIGZvcmdldHMgYSBwYW5lbDsgYGZvcmdldGAgYSB3aG9sZSBzZXNzaW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJlYWRlcnMge1xuICBzZXQoc2lkOiBzdHJpbmcsIGtleTogc3RyaW5nLCBsYWJlbDogc3RyaW5nIHwgbnVsbCk6IHZvaWQ7XG4gIGRyb3Aoc2lkOiBzdHJpbmcsIGtleTogc3RyaW5nKTogdm9pZDtcbiAgZm9yZ2V0KHNpZDogc3RyaW5nKTogdm9pZDtcbiAgLyoqIFdoYXQgdGhlIGhvc3Qgd2FzIGxhc3QgdG9sZCBmb3IgYHNpZGAgKCcnIGZvciBub3RoaW5nKS4gKi9cbiAgY3VycmVudChzaWQ6IHN0cmluZyk6IHN0cmluZztcbn1cbmV4cG9ydCBmdW5jdGlvbiByZWFkZXJzKHZpZXdpbmc6IChsYWJlbDogc3RyaW5nIHwgbnVsbCwgc2lkOiBzdHJpbmcpID0+IHZvaWQpOiBSZWFkZXJzIHtcbiAgY29uc3QgcGVyID0gbmV3IE1hcDxzdHJpbmcsIHsgYnk6IE1hcDxzdHJpbmcsIHN0cmluZyB8IG51bGw+OyBjdXI6IHN0cmluZyB9PigpO1xuICBjb25zdCBzZXR0bGUgPSAoc2lkOiBzdHJpbmcsIHdhbnQ6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICBjb25zdCBzID0gcGVyLmdldChzaWQpO1xuICAgIGlmICghcykgcmV0dXJuO1xuICAgIGxldCBuZXh0ID0gd2FudCA/PyAnJztcbiAgICBpZiAoIW5leHQpIHtcbiAgICAgIC8vIFRoZSBvbmUgdG9sZCBiZWZvcmUsIGlmIGEgcGFuZWwgc3RpbGwgcmVhZHMgaXQ7IGVsc2UgdGhlIGxhc3QgcGFuZWwgc3RpbGwgcmVhZGluZyBhbnl0aGluZy5cbiAgICAgIGNvbnN0IGhlbGQgPSBbLi4ucy5ieS52YWx1ZXMoKV0uZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKTtcbiAgICAgIG5leHQgPSBoZWxkLmluY2x1ZGVzKHMuY3VyKSA/IHMuY3VyIDogaGVsZFtoZWxkLmxlbmd0aCAtIDFdID8/ICcnO1xuICAgIH1cbiAgICAvLyBBIGxhYmVsIGlzIHJlLXNlbnQgZXZlbiB3aGVuIHVuY2hhbmdlZDogdGhhdCBtYXJrcyBsaW5lcyB0aGF0IGp1c3QgYXJyaXZlZCB0aGVyZSByZWFkLlxuICAgIGlmIChuZXh0ICE9PSBzLmN1ciB8fCAod2FudCAmJiBuZXh0KSkgeyBzLmN1ciA9IG5leHQ7IHZpZXdpbmcobmV4dCB8fCBudWxsLCBzaWQpOyB9XG4gIH07XG4gIHJldHVybiB7XG4gICAgc2V0KHNpZCwga2V5LCBsYWJlbCkge1xuICAgICAgY29uc3QgcyA9IHBlci5nZXQoc2lkKSA/PyBwZXIuc2V0KHNpZCwgeyBieTogbmV3IE1hcCgpLCBjdXI6ICcnIH0pLmdldChzaWQpITtcbiAgICAgIHMuYnkuZGVsZXRlKGtleSk7IHMuYnkuc2V0KGtleSwgbGFiZWwgfHwgbnVsbCk7IC8vIHJlLWluc2VydDogbGF0ZXN0IGxhc3RcbiAgICAgIHNldHRsZShzaWQsIGxhYmVsIHx8IG51bGwpO1xuICAgIH0sXG4gICAgZHJvcChzaWQsIGtleSkgeyBjb25zdCBzID0gcGVyLmdldChzaWQpOyBpZiAocz8uYnkuZGVsZXRlKGtleSkpIHNldHRsZShzaWQsIG51bGwpOyB9LFxuICAgIGZvcmdldChzaWQpIHsgcGVyLmRlbGV0ZShzaWQpOyB9LFxuICAgIGN1cnJlbnQ6IChzaWQpID0+IHBlci5nZXQoc2lkKT8uY3VyID8/ICcnLFxuICB9O1xufVxuXG4vKiogVHJ1ZSB3aGVuIGFueSBmZWVkIGhvbGRzIGEgbGluZS4gKi9cbmV4cG9ydCBjb25zdCBoYXNMaW5lcyA9ICh2aWV3OiBGZWVkc1ZpZXcgfCBudWxsKTogYm9vbGVhbiA9PiAhIXZpZXcgJiYgT2JqZWN0LnZhbHVlcyh2aWV3LmxpbmVzKS5zb21lKChscykgPT4gbHMubGVuZ3RoID4gMCk7XG5cbi8qKlxuICogQ2FsbCBgb25GaXJzdChzaWQpYCBvbmNlIHBlciBpbi1zY29wZSBzZXNzaW9uLCB0aGUgZmlyc3QgdGltZSBvbmUgb2YgaXRzIGZlZWRzIGhvbGRzIGEgbGluZSAoYXQgb25jZSBmb3IgYSBzZXNzaW9uXG4gKiB0aGF0IGFscmVhZHkgaGFzIGxpbmVzKS4gQnVpbHQgb24gYG11LnNlc3Npb25zLmVhY2hgOiB0aGUgaG9zdCBydW5zIGl0IGZvciBldmVyeSBzZXNzaW9uIGluIHNjb3BlIGFuZCBkaXNwb3NlcyBhXG4gKiBzZXNzaW9uJ3Mgd2F0Y2ggd2hlbiBpdCBsZWF2ZXMgc2NvcGU7IGEgc2Vzc2lvbiB0aGF0IGNvbWVzIGJhY2sgaXMgYSBuZXcgc2Vzc2lvbiBhbmQgZmlyZXMgYWdhaW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkZpcnN0TGluZShtdTogUGljazxNdSwgJ2ZlZWRzJyB8ICdzZXNzaW9ucyc+LCBvbkZpcnN0OiAoc2lkOiBzdHJpbmcpID0+IHZvaWQpOiBEaXNwb3NlIHtcbiAgcmV0dXJuIG11LnNlc3Npb25zLmVhY2goKHMpID0+IHtcbiAgICBsZXQgZG9uZSA9IGZhbHNlLCBvZmY6IERpc3Bvc2UgfCBudWxsID0gbnVsbDtcbiAgICBjb25zdCBzdG9wID0gKCkgPT4geyBjb25zdCBkID0gb2ZmOyBvZmYgPSBudWxsOyBkPy4oKTsgfTtcbiAgICAvLyB3YXRjaCgpIGNhbGxzIGJhY2sgYXQgb25jZSB3aXRoIHRoZSBmZWVkcyBub3csIGJlZm9yZSBpdCBoYXMgcmV0dXJuZWQgaXRzIGRpc3Bvc2UuXG4gICAgY29uc3QgZCA9IG11LmZlZWRzLndhdGNoKCh2aWV3KSA9PiB7XG4gICAgICBpZiAoZG9uZSB8fCAhaGFzTGluZXModmlldykpIHJldHVybjtcbiAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgb25GaXJzdChzLmlkKTtcbiAgICAgIHN0b3AoKTtcbiAgICB9LCBzLmlkKTtcbiAgICBpZiAoZG9uZSkgZCgpOyBlbHNlIG9mZiA9IGQ7XG4gICAgcmV0dXJuIHN0b3A7XG4gIH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQVVBLFNBQVMsdUJBQWdDOzs7QUNMekMsU0FBUyxVQUFVLGlC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
