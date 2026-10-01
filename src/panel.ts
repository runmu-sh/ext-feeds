/**
 * The Feeds panel (R-FEEDS, U-FEEDS) as a Vue component with render functions (`vue` is the host's, through the
 * import map). A tab per feed with unread badges, Search, Times, Pop out, Rules, Clear, the latest pill, and
 * "Add a feed" when there is none. With `params.feed` (the `feed` panel) it shows that one feed only.
 * Ported from μClient's features/rules/FeedsPanel.vue onto `mu.feeds` (SDK 1.7).
 */
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef, watch, type VNode } from 'vue';
import type { Dispose, FeedLineView, FeedsView, Mu } from '@muclient/sdk';
import { COPY, filterLines, hhmmss, keepSelection, labelsOf, nearEnd, newTail, soloOf, stepTail, tabLabel, tabTarget, unreadOf, type Tail } from './model';

export function createPanel(mu: Mu) {
  const c = mu.ui.css;
  return defineComponent({
    name: 'FeedsPanel',
    props: { sid: { type: String, default: null }, worldId: { type: String, default: null }, params: { type: Object, default: () => ({}) } },
    setup(props) {
      const view = shallowRef<FeedsView | null>(null);
      let off: Dispose | null = null;
      watch(() => props.sid, (sid) => {
        off?.(); off = null;
        view.value = null;
        // watch calls back at once with the feeds now: no separate get.
        if (sid) off = mu.feeds.watch((v) => { view.value = v; }, sid);
      }, { immediate: true });

      const solo = computed(() => soloOf(props.params as Record<string, unknown>));
      const labels = computed(() => labelsOf(view.value, solo.value));
      const sel = ref('');
      watch(labels, (ls) => { sel.value = keepSelection(ls, sel.value); }, { immediate: true });
      const tell = (label: string | null) => { if (props.sid) mu.feeds.viewing(label || null, props.sid); };
      watch([sel, () => props.sid], () => tell(sel.value), { immediate: true });

      const lines = computed<FeedLineView[]>(() => (sel.value ? view.value?.lines[sel.value] ?? [] : []));
      const searching = ref(false), q = ref(''), times = ref(false);
      const shown = computed(() => filterLines(lines.value, q.value));

      const box = ref<HTMLElement | null>(null);
      const search = ref<HTMLInputElement | null>(null);
      const tail = ref<Tail>(newTail());
      const scrollEnd = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight; });
      /** At the end of a feed you have read it: clear its unread count. */
      const markRead = () => { if (sel.value && (view.value?.unread[sel.value] ?? 0) > 0) tell(sel.value); };
      watch([sel, shown], () => {
        tail.value = stepTail(tail.value, sel.value, shown.value);
        if (tail.value.atEnd) { scrollEnd(); markRead(); }
      }, { immediate: true });
      const setAtEnd = (atEnd: boolean) => {
        if (atEnd === tail.value.atEnd) return;
        tail.value = { ...tail.value, atEnd, fresh: atEnd ? 0 : tail.value.fresh };
        if (atEnd) markRead();
      };
      const onScroll = () => { if (box.value?.clientHeight) setAtEnd(nearEnd(box.value)); };
      const toEnd = () => { setAtEnd(true); scrollEnd(); };

      const tabs = new Map<string, HTMLElement>();
      const tabKey = (e: KeyboardEvent, i: number) => {
        const j = tabTarget(e.key, i, labels.value.length);
        if (j < 0) return;
        e.preventDefault();
        sel.value = labels.value[j];
        nextTick(() => tabs.get(sel.value)?.focus());
      };
      const toggleSearch = () => {
        searching.value = !searching.value;
        if (!searching.value) q.value = '';
        else nextTick(() => search.value?.focus());
      };
      const clear = () => { if (props.sid && sel.value && confirm(COPY.confirmClear(sel.value))) mu.feeds.clear(sel.value, props.sid); };
      /** Rules and "Add a feed" open Settings → Feeds. */
      const editRules = () => mu.commands.run('settings.open', 'feeds');
      const popOut = () => {
        if (!sel.value) return;
        mu.panels.open('feed', { feed: sel.value, instance: sel.value }, { title: COPY.popTitle(sel.value), ...(props.sid ? { sid: props.sid } : {}) });
      };

      // The main panel says it stopped looking (the host also resets it on dispose). A popped-out `feed`
      // closing must not clear what the main panel is still showing.
      onBeforeUnmount(() => { off?.(); off = null; if (!solo.value) tell(null); });

      const tool = (label: string, attrs: Record<string, unknown>, on = false) =>
        h('button', { type: 'button', class: [c.tool, { on }], ...attrs }, label);
      const spanOf = (s: FeedLineView['spans'][number], k: number): VNode => (s.href
        ? h('a', { key: k, href: s.href, target: '_blank', rel: 'noopener', class: s.cls, style: s.style }, s.text)
        : h('span', { key: k, class: s.cls, style: s.style }, s.text));

      return () => {
        const ls = labels.value, cur = sel.value;
        if (!ls.length) {
          return h('div', { class: 'mu-feeds', 'data-testid': 'feeds-panel' }, [
            h('div', { class: 'intro' }, [h('button', { type: 'button', class: [c.cmd, 'primary', 'make'], onClick: editRules }, COPY.addFeed)]),
          ]);
        }
        const bar = h('div', { class: 'fbar' }, [
          solo.value
            ? h('span', { class: 'solo' }, solo.value)
            : h('div', { class: 'ftabs', role: 'tablist', 'aria-label': 'Feeds' }, ls.map((l, i) => {
              const n = unreadOf(view.value, l, cur);
              return h('button', {
                key: l, type: 'button', role: 'tab', class: ['ftab', { on: l === cur }],
                ref: (el: unknown) => { if (el) tabs.set(l, el as HTMLElement); else tabs.delete(l); },
                'aria-selected': l === cur, tabindex: l === cur ? 0 : -1, 'aria-label': tabLabel(l, n),
                onClick: () => { sel.value = l; }, onKeydown: (e: KeyboardEvent) => tabKey(e, i),
              }, [l, n ? h('span', { class: ['fbadge', c.count], 'aria-hidden': 'true' }, String(n)) : null]);
            })),
          h('span', { class: 'tools', role: 'toolbar', 'aria-label': 'Feed tools' }, [
            tool(COPY.search, { 'aria-pressed': searching.value, 'aria-label': 'Search this feed', title: 'search', onClick: toggleSearch }, searching.value),
            tool(COPY.times, { 'aria-pressed': times.value, 'aria-label': 'Timestamps', title: 'timestamps', onClick: () => { times.value = !times.value; } }, times.value),
            !solo.value && cur ? tool(COPY.popOut, { title: 'own panel', 'aria-label': `Open ${cur} in its own panel`, onClick: popOut }) : null,
            tool(COPY.rules, { 'aria-label': 'Edit feed rules', title: 'rules', onClick: editRules }),
            cur ? h('button', { type: 'button', class: [c.tool, 'danger'], title: 'clear', 'aria-label': `Clear ${cur} feed`, onClick: clear }, COPY.clear) : null,
          ]),
        ]);
        const searchRow = searching.value ? h('div', { class: 'fsearch' }, [
          h('input', {
            ref: search, class: c.field, value: q.value, placeholder: `search ${cur}…`, 'aria-label': `Search ${cur}`,
            onInput: (e: Event) => { q.value = (e.target as HTMLInputElement).value; },
            onKeydown: (e: KeyboardEvent) => { if (e.key === 'Escape') { searching.value = false; q.value = ''; } },
          }),
          h('span', { class: 'cnt', 'aria-live': 'polite' }, [String(shown.value.length), ' ', h('span', { class: 'sr-only' }, 'matching lines')]),
        ]) : null;
        const rows = shown.value.map((l) => h('div', { key: l.id, class: ['fline', l.rowCls], 'data-testid': 'feed-line' }, [
          times.value ? h('span', { class: 'ts' }, hhmmss(l.ts)) : null,
          ...l.spans.map(spanOf),
        ]));
        const t = tail.value;
        const pill = t.atEnd ? null : t.fresh > 0
          ? h('button', { type: 'button', class: 'latest', onClick: toEnd }, COPY.latest(t.fresh))
          : h('button', { type: 'button', class: 'latest', 'aria-label': 'Jump to the latest line', onClick: toEnd }, '↓');
        return h('div', { class: 'mu-feeds', 'data-testid': 'feeds-panel' }, [
          bar, searchRow,
          h('div', { class: 'lines-wrap' }, [
            h('div', {
              ref: box, class: 'flines', role: 'log', 'aria-live': 'off', tabindex: 0, 'aria-label': `${cur} feed`,
              onScroll, onWheel: (e: WheelEvent) => { if (e.deltaY < 0) setAtEnd(false); },
            }, [...rows, shown.value.length ? null : h('p', { class: [c.empty, 'fempty'] }, q.value.trim() ? COPY.noMatches : COPY.empty)]),
            pill,
          ]),
        ]);
      };
    },
  });
}
