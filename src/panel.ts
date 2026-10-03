/**
 * The Feeds panel as a Vue component with render functions (`vue` is the host's, through the import map). A tab per
 * feed with unread badges (tooltip: line count; double-click pops it out), Search, Times, Pop out, Rules, Clear, a `?`
 * help strip, the latest pill, an explanation with "Add a feed" when there is no feed, and a hint with Rules in a feed
 * that has no lines yet. With `params.feed` (the `feed` panel) it shows that one feed only.
 */
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef, watch, type VNode } from 'vue';
import type { Dispose, FeedLineView, Mu } from '@muclient/sdk';
import {
  COPY, filterLines, hhmmss, keepSelection, labelsOf, nearEnd, newTail, pillOf, readingOf, soloOf, stepTail, tabLabel,
  tabTarget, unreadOf, type FeedsState, type Readers, type Tail,
} from './model';
import type { FeedStore } from './store';

let panelSeq = 0;

export function createPanel(mu: Mu, store: Pick<FeedStore, 'watch' | 'clear'>, reading: Readers) {
  const c = mu.ui.css;
  return defineComponent({
    name: 'FeedsPanel',
    props: { sid: { type: String, default: null }, worldId: { type: String, default: null }, params: { type: Object, default: () => ({}) } },
    setup(props) {
      const key = `p${++panelSeq}`;
      const view = shallowRef<FeedsState | null>(null);
      let off: Dispose | null = null;
      let readSid: string | null = null;
      watch(() => props.sid, (sid) => {
        off?.(); off = null;
        if (readSid) reading.drop(readSid, key);
        readSid = sid;
        view.value = null;
        // watch calls back at once with the feeds now: no separate get.
        if (sid) off = store.watch(sid, (v) => { view.value = v; });
      }, { immediate: true });

      const solo = computed(() => soloOf(props.params as Record<string, unknown>));
      const labels = computed(() => labelsOf(view.value, solo.value));
      const sel = ref('');
      watch(labels, (ls) => { sel.value = keepSelection(ls, sel.value); }, { immediate: true });

      const lines = computed<FeedLineView[]>(() => (sel.value ? view.value?.lines[sel.value] ?? [] : []));
      const searching = ref(false), q = ref(''), times = ref(false), helping = ref(false);
      const shown = computed(() => filterLines(lines.value, q.value));

      const box = ref<HTMLElement | null>(null);
      const search = ref<HTMLInputElement | null>(null);
      const tail = ref<Tail>(newTail());
      const scrollEnd = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight; });
      /** Tell the store what this panel reads: the selected feed while at its end (that marks it read), else nothing. */
      const report = () => { if (props.sid) reading.set(props.sid, key, readingOf(sel.value, tail.value.atEnd)); };
      watch([sel, shown], () => {
        tail.value = stepTail(tail.value, sel.value, shown.value);
        if (tail.value.atEnd) scrollEnd();
        report();
      }, { immediate: true });
      watch(() => props.sid, report);
      const setAtEnd = (atEnd: boolean) => {
        if (atEnd === tail.value.atEnd) return;
        tail.value = { ...tail.value, atEnd, fresh: atEnd ? 0 : tail.value.fresh };
        report();
      };
      const onScroll = () => { if (box.value?.clientHeight) setAtEnd(nearEnd(box.value)); };
      const toEnd = () => { setAtEnd(true); scrollEnd(); };

      // A panel hidden behind another tab has no height; shown again at the end, it goes back to the end.
      let hidden = false;
      const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
        const b = box.value;
        if (!b) return;
        if (!b.clientHeight) { hidden = true; return; }
        if (hidden && tail.value.atEnd) b.scrollTop = b.scrollHeight;
        hidden = false;
      });
      watch(box, (b, was) => { if (was) ro?.unobserve(was); if (b) ro?.observe(b); });

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
      const clear = async () => {
        const sid = props.sid, label = sel.value;
        if (!sid || !label) return;
        const n = view.value?.lines[label]?.length ?? 0;
        if (await mu.ui.confirm({ title: COPY.confirmClear(label), body: COPY.confirmClearBody(label, n), confirm: COPY.clear, danger: true })) store.clear(label, sid);
      };
      /** Rules and "Add a feed" open this extension's Settings page. */
      const editRules = () => mu.settings.open();
      const popOut = (label = sel.value) => {
        if (!label || solo.value) return;
        mu.panels.open('feed', { feed: label, instance: label }, { title: COPY.popTitle(label), ...(props.sid ? { sid: props.sid } : {}) });
      };

      // Stop reading here. Another panel still reading keeps it.
      onBeforeUnmount(() => {
        ro?.disconnect();
        off?.(); off = null;
        if (readSid) reading.drop(readSid, key);
        readSid = null;
      });

      const tool = (label: string, attrs: Record<string, unknown>, on = false) =>
        h('button', { type: 'button', class: [c.cmd, { [c.on]: on }], ...attrs }, label);
      const spanOf = (s: FeedLineView['spans'][number], k: number): VNode => (s.href
        ? h('a', { key: k, href: s.href, target: '_blank', rel: 'noopener noreferrer', class: s.cls, style: s.style }, s.text)
        : h('span', { key: k, class: s.cls, style: s.style }, s.text));

      return () => {
        const ls = labels.value, cur = sel.value;
        if (!ls.length) {
          return h('div', { class: 'mu-feeds', 'data-testid': 'feeds-panel' }, [
            h('div', { class: 'intro', 'data-testid': 'feeds-intro' }, [
              h('p', { class: 'ihead' }, COPY.introHead),
              h('p', null, COPY.introText),
              h('ol', null, COPY.introSteps.map((t, i) => h('li', { key: i }, t))),
              h('button', { type: 'button', class: [c.cmd, 'primary', 'make'], 'data-testid': 'feeds-add', onClick: editRules }, COPY.addFeed),
            ]),
          ]);
        }
        const bar = h('div', { class: 'fbar' }, [
          solo.value
            ? h('span', { class: 'solo' }, solo.value)
            : h('div', { class: 'ftabs', role: 'tablist', 'aria-label': COPY.title }, ls.map((l, i) => {
              const n = unreadOf(view.value, l, cur);
              const total = view.value?.lines[l]?.length ?? 0;
              return h('button', {
                key: l, type: 'button', role: 'tab', class: ['ftab', { on: l === cur, unread: n > 0 }], 'data-testid': 'feed-tab',
                ref: (el: unknown) => { if (el) tabs.set(l, el as HTMLElement); else tabs.delete(l); },
                'aria-selected': l === cur, tabindex: l === cur ? 0 : -1, 'aria-label': tabLabel(l, n), title: COPY.tabTip(l, total),
                onClick: () => { sel.value = l; }, onDblclick: () => popOut(l), onKeydown: (e: KeyboardEvent) => tabKey(e, i),
              }, [h('span', { class: 'fname' }, l), n ? h('span', { class: ['fbadge', c.count], 'aria-hidden': 'true' }, String(n)) : null]);
            })),
          h('span', { class: 'tools', role: 'toolbar', 'aria-label': 'Feed tools' }, [
            tool(COPY.search, { 'aria-pressed': searching.value, 'aria-label': 'Search this feed', title: 'search', onClick: toggleSearch }, searching.value),
            tool(COPY.times, { 'aria-pressed': times.value, 'aria-label': 'Timestamps', title: 'timestamps', onClick: () => { times.value = !times.value; } }, times.value),
            !solo.value && cur ? tool(COPY.popOut, { title: 'this feed in its own panel', 'aria-label': `Open ${cur} in its own panel`, 'data-testid': 'feed-popout', onClick: () => popOut() }) : null,
            tool(COPY.rules, { 'aria-label': 'Edit feed rules', title: COPY.rulesTip, onClick: editRules }),
            cur ? tool(COPY.clear, { title: 'empty this feed', 'aria-label': `Clear ${cur} feed`, 'data-testid': 'feed-clear', onClick: () => { void clear(); } }) : null,
            tool(COPY.help, { 'aria-pressed': helping.value, 'aria-label': COPY.helpTitle, title: 'what the buttons do', 'data-testid': 'feed-help', onClick: () => { helping.value = !helping.value; } }, helping.value),
          ]),
        ]);
        const searchRow = searching.value ? h('div', { class: 'fsearch' }, [
          h('input', {
            ref: search, class: [c.field, c.placeholder], value: q.value, placeholder: COPY.searchIn(cur), 'aria-label': COPY.searchIn(cur),
            'data-testid': 'feed-search',
            onInput: (e: Event) => { q.value = (e.target as HTMLInputElement).value; },
            onKeydown: (e: KeyboardEvent) => { if (e.key === 'Escape') { searching.value = false; q.value = ''; } },
          }),
          h('span', { class: 'cnt', 'aria-live': 'polite' }, [String(shown.value.length), ' ', h('span', { class: 'sr-only' }, 'matching lines')]),
        ]) : null;
        const helpRow = helping.value ? h('div', { class: 'fhelp', 'data-testid': 'feed-help-strip', role: 'note', 'aria-label': COPY.helpTitle }, [
          h('dl', null, COPY.helpRows.flatMap(([k, v]) => [h('dt', { key: `${k}:t` }, k), h('dd', { key: `${k}:d` }, v)])),
          h('p', null, COPY.helpNote),
        ]) : null;
        const rows = shown.value.map((l) => h('div', { key: l.id, class: ['fline', l.rowCls], 'data-testid': 'feed-line' }, [
          times.value ? h('span', { class: 'ts' }, hhmmss(l.ts)) : null,
          ...l.spans.map(spanOf),
        ]));
        const p = pillOf(tail.value);
        const pill = p ? h('button', {
          type: 'button', class: ['latest', { quiet: p.quiet }], 'data-testid': 'feed-latest', onClick: toEnd,
          ...(p.quiet ? { 'aria-label': COPY.jumpLatest } : {}),
        }, p.text) : null;
        return h('div', { class: 'mu-feeds', 'data-testid': 'feeds-panel' }, [
          bar, searchRow, helpRow,
          h('div', { class: 'lines-wrap' }, [
            h('div', {
              ref: box, class: 'flines', role: 'log', 'aria-live': 'off', tabindex: 0, 'aria-label': `${cur} feed`, 'data-focus-region': 'feeds',
              onScroll, onWheel: (e: WheelEvent) => { if (e.deltaY < 0) setAtEnd(false); },
            }, [
              ...rows,
              shown.value.length ? null : h('p', { class: [c.empty, 'fempty'] }, q.value.trim() ? COPY.noMatches : COPY.empty),
              shown.value.length || q.value.trim() ? null : h('p', { class: 'fempty-hint', 'data-testid': 'feed-empty-hint' }, [COPY.emptyHint(cur), ' ', h('button', { type: 'button', class: c.cmd, onClick: editRules }, COPY.rules)]),
            ]),
            pill,
          ]),
        ]);
      };
    },
  });
}
